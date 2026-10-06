/**
 * The Trade Builder's two channels: the ticker list (with how fresh each one's saved data is) and
 * a ticker's data (Schwab live first, then schwab.db, then game.db; see builderLoad.ts). Read-only:
 * nothing here places orders or reads accounts. In E2E runs Schwab is never called.
 */

import { existsSync } from 'node:fs';
import { CANDIDATES } from '../../data-pipeline/dolt/tickers';
import { builderLoad } from '../../data-pipeline/schwab/builderLoad';
import { schwabFetchApi } from '../../data-pipeline/schwab/client';
import { SchwabStore } from '../../data-pipeline/schwab/store';
import { BUILDER_BY_SYMBOL } from '../../src/content/builderTickers';
import type { BuilderList, BuilderListItem } from '../../src/shared/rpc';
import { currentSource } from './dataService';
import { addHandlers } from './ipc';
import { log } from './log';
import { schwabStorePath } from './paths';
import { schwabAccessToken, schwabStatus } from './schwab';

function openStore(): SchwabStore | null {
  const p = schwabStorePath();
  if (!existsSync(p)) return null;
  try {
    return new SchwabStore(p, { readOnly: true });
  } catch (e) {
    log('warn', 'builder: could not read schwab.db', e);
    return null;
  }
}

async function list(): Promise<BuilderList> {
  const game = currentSource();
  const meta = await game.meta().catch(() => null);
  const syms = await game.symbols().catch(() => []);
  const store = openStore();
  const items = new Map<string, BuilderListItem>();
  try {
    const savedThrough = (symbol: string) => {
      const a = store?.lastCandleDate(symbol) ?? null;
      const b = syms.find((s) => s.symbol === symbol)?.lastDate ?? null;
      return a && b ? (a > b ? a : b) : (a ?? b);
    };
    for (const c of CANDIDATES) {
      const b = BUILDER_BY_SYMBOL[c.symbol];
      items.set(c.symbol, {
        symbol: c.symbol,
        name: c.name,
        sector: c.sector,
        group: c.sector.includes('ETF') ? 'etf' : 'stock',
        isNew: !!b,
        savedThrough: savedThrough(c.symbol),
      });
    }
    // The practice (SIM) market's own tickers, so the builder works with no real data at all.
    for (const s of syms)
      if (!items.has(s.symbol))
        items.set(s.symbol, {
          symbol: s.symbol,
          name: s.name,
          sector: s.sector,
          group: s.kind === 'synthetic' ? 'sim' : s.isEtf ? 'etf' : 'stock',
          isNew: false,
          savedThrough: s.lastDate,
        });
  } finally {
    store?.close();
  }
  return {
    schwab: process.env.STG_E2E === '1' ? false : schwabStatus().connected,
    dataKind: meta?.kind ?? null,
    tickers: [...items.values()],
  };
}

export function registerBuilderHandlers(): void {
  addHandlers({
    'builder.list': () => list(),
    'builder.load': async (symbol: string) => {
      let token: string | null = null;
      if (process.env.STG_E2E !== '1')
        try {
          token = await schwabAccessToken();
        } catch (e) {
          log('warn', 'builder: Schwab login could not be refreshed', e);
        }
      const store = openStore();
      try {
        return await builderLoad({
          symbol,
          now: new Date(),
          api: token ? schwabFetchApi(token) : null,
          store,
          game: currentSource(),
        });
      } finally {
        store?.close();
      }
    },
  });
}
