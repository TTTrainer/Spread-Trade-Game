/**
 * Tops a DoltHub-built game.db up with the days DoltHub hasn't published yet, from schwab.db (what
 * PULL FROM SCHWAB saved). Every ticker gets its candles through the store's latest close. A day
 * with a real chain in the store uses it; any other new day is modeled from the prior chain and
 * labeled MODEL, exactly as the pipeline fills DoltHub's own gaps.
 *
 * Later DoltHub syncs overwrite these rows with DoltHub's, so its data stays the reference.
 */

import { addDays, nextTradingDay, type ISODate } from '../../src/engine/calendar';
import type { Bar, Chain, DatasetMeta } from '../../src/engine/market/types';
import { GameDbWriter } from '../lib/gameDb';
import { SqliteSource } from '../lib/sqliteSource';
import { constantMaturityIv, modelMissingDay, normalizeQuote, volSeries } from '../lib/derived';
import { decDate, encDate } from '../lib/schema';
import { SchwabStore } from './store';

export type { SchwabMarketApi } from './pull';

export interface TopUpResult {
  ok: boolean;
  message: string;
  lastDate: ISODate;
  newDays: ISODate[];
  realChains: number;
  modeledChains: number;
}

const SCHWAB_NOTE =
  'Days after the DoltHub data: Schwab market data (read-only), from schwab.db on this computer.';

function divYieldOn(divs: { exDate: ISODate; amount: number }[], date: ISODate, spot: number): number {
  const year = divs.filter((d) => d.exDate <= date && d.exDate > addDays(date, -365));
  const sum = year.reduce((a, d) => a + d.amount, 0);
  return spot > 0 ? sum / spot : 0;
}

export async function schwabTopUp(opts: {
  gameDbPath: string;
  storePath: string;
  log?: (m: string) => void;
  progress?: (stage: string, f: number) => void;
}): Promise<TopUpResult> {
  const progress = opts.progress ?? (() => undefined);
  const src = new SqliteSource(opts.gameDbPath);
  let meta: DatasetMeta;
  try {
    meta = await src.meta();
  } catch (e) {
    src.close();
    throw e;
  }
  const none = (message: string): TopUpResult => ({
    ok: true,
    message,
    lastDate: meta.lastDate,
    newDays: [],
    realChains: 0,
    modeledChains: 0,
  });
  if (meta.kind !== 'real') {
    src.close();
    return { ...none('Adding Schwab days needs real market data. Build it first.'), ok: false };
  }
  const store = new SchwabStore(opts.storePath, { readOnly: true });

  // Read what's there first (the source is read-only), then write.
  const symbols = await src.symbols();
  const histFrom = addDays(meta.lastDate, -400);
  const rates = await src.rates(addDays(meta.lastDate, -30), meta.lastDate);
  const rate = rates.at(-1)?.r3m ?? 0.02;
  const firstNew = nextTradingDay(meta.lastDate);
  const plan: {
    symbol: string;
    oldBars: Bar[];
    newBars: Bar[];
    prior: Chain | null;
    real: Map<ISODate, Chain>;
    divs: { exDate: ISODate; amount: number }[];
  }[] = [];
  try {
    for (const [i, s] of symbols.entries()) {
      progress('Adding the newest days from schwab.db', i / Math.max(1, symbols.length));
      const newBars = store.candles(s.symbol, firstNew);
      if (!newBars.length) continue;
      plan.push({
        symbol: s.symbol,
        oldBars: await src.bars(s.symbol, histFrom, meta.lastDate),
        newBars,
        prior: await src.chain(s.symbol, meta.lastDate),
        real: new Map(store.chains(s.symbol, firstNew).map((c) => [c.date, c] as const)),
        divs: await src.dividends(s.symbol, addDays(meta.lastDate, -365), newBars[newBars.length - 1].date),
      });
    }
  } finally {
    store.close();
  }
  const iv30Hist = new Map<string, Map<ISODate, number>>();
  for (const p of plan) {
    const rows = src.db
      .prepare('SELECT date, iv30 FROM vol WHERE symbol = ? AND iv30 IS NOT NULL AND date >= ?')
      .all(p.symbol, encDate(histFrom)) as { date: number; iv30: number }[];
    iv30Hist.set(p.symbol, new Map(rows.map((r) => [decDate(r.date), r.iv30] as const)));
  }
  src.close();
  if (!plan.length) return none(`schwab.db has no days after ${meta.lastDate} yet. Pull from Schwab first.`);

  const writer = new GameDbWriter(opts.gameDbPath);
  const newDays = new Set<ISODate>();
  let realChains = 0;
  let modeledChains = 0;
  try {
    for (const p of plan) {
      const chains: Chain[] = [];
      let prior = p.prior;
      const iv30 = iv30Hist.get(p.symbol) ?? new Map<ISODate, number>();
      for (const bar of p.newBars) {
        newDays.add(bar.date);
        const dy = divYieldOn(p.divs, bar.date, bar.close);
        let chain: Chain | null = null;
        const r = p.real.get(bar.date);
        if (r) {
          const quotes = r.quotes
            .map((q) => normalizeQuote(q, bar.date, r.spot, rate, dy))
            .filter((q): q is NonNullable<typeof q> => q !== null);
          if (quotes.length) chain = { ...r, quotes };
        }
        if (chain) realChains++;
        else if (prior) {
          chain = modelMissingDay({
            symbol: p.symbol,
            date: bar.date,
            spot: bar.close,
            prior,
            rate,
            divYield: dy,
            weeklies: true,
          });
          modeledChains++;
        }
        if (!chain) continue;
        if (chain.source === 'real') prior = chain;
        chains.push(chain);
        const iv = constantMaturityIv(chain, 30, rate, dy);
        if (iv) iv30.set(bar.date, iv);
      }
      writer.putBars(p.symbol, p.newBars);
      writer.putChains(chains);
      const all = [...p.oldBars, ...p.newBars];
      writer.putVol(
        p.symbol,
        volSeries(all, iv30).filter((v) => v.date > meta.lastDate),
      );
    }
    const days = [...newDays].sort();
    const last = days.at(-1) as ISODate;
    writer.putTradingDays(days);
    const setLast = writer.db.prepare('UPDATE symbols SET last_date = ? WHERE symbol = ?');
    for (const p of plan) setLast.run(p.newBars.at(-1)?.date ?? meta.lastDate, p.symbol);
    writer.setMeta({
      ...meta,
      lastDate: last,
      notes: [...meta.notes.filter((n) => !n.startsWith('Days after the DoltHub data')), SCHWAB_NOTE],
    });
  } finally {
    writer.close();
  }
  const days = [...newDays].sort();
  const lastDate = days.at(-1) ?? meta.lastDate;
  progress('Schwab days added', 1);
  return {
    ok: true,
    message: `Added ${days.length} day${days.length === 1 ? '' : 's'} through ${lastDate} from schwab.db for ${plan.length} tickers (${realChains} real option chain${realChains === 1 ? '' : 's'}).`,
    lastDate,
    newDays: days,
    realChains,
    modeledChains,
  };
}

/**
 * A DoltHub sync rewrites the dataset's last date to DoltHub's own, which can be older than days
 * already topped up from Schwab. Those rows are still in the tables; put the last date back so
 * the calendar never moves backwards under a Live month.
 */
export function keepLaterDays(gameDbPath: string, previousLast: ISODate): void {
  const writer = new GameDbWriter(gameDbPath);
  try {
    const row = writer.db.prepare("SELECT value FROM meta WHERE key = 'dataset'").get() as
      { value: string } | undefined;
    if (!row) return;
    const meta = JSON.parse(row.value) as DatasetMeta;
    if (meta.lastDate >= previousLast) return;
    const maxBar = writer.db.prepare('SELECT MAX(date) AS d FROM bars WHERE symbol = ?');
    const syms = writer.db.prepare('SELECT symbol FROM symbols').all() as { symbol: string }[];
    const setLast = writer.db.prepare('UPDATE symbols SET last_date = ? WHERE symbol = ?');
    for (const { symbol } of syms) {
      const d = (maxBar.get(symbol) as { d: number | null } | undefined)?.d;
      if (d) setLast.run(decDate(d), symbol);
    }
    writer.setMeta({ ...meta, lastDate: previousLast });
  } finally {
    writer.close();
  }
}
