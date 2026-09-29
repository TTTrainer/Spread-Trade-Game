/**
 * Tops game.db up with the days DoltHub hasn't published yet, from Schwab's read-only market
 * data. Every ticker gets its daily candles through the latest final close. Schwab only serves
 * today's option chain (no history), so the latest close gets a real chain when it's fetched
 * outside market hours, and any day between the last chain and it is modeled from the prior chain
 * and labeled MODEL, exactly as the pipeline fills DoltHub's own gaps.
 *
 * Later DoltHub syncs overwrite these rows with DoltHub's, so its data stays the reference.
 */

import { addDays, type ISODate } from '../../src/engine/calendar';
import type { Bar, Chain, DatasetMeta } from '../../src/engine/market/types';
import { GameDbWriter } from '../lib/gameDb';
import { SqliteSource } from '../lib/sqliteSource';
import { constantMaturityIv, modelMissingDay, volSeries } from '../lib/derived';
import { decDate, encDate } from '../lib/schema';
import { closedThrough, mapCandles, mapChain } from './map';

/** The two read-only calls the top-up needs (a fake in tests, fetch against Schwab in the game). */
export interface SchwabMarketApi {
  priceHistory(symbol: string, fromDate: ISODate): Promise<unknown>;
  chain(symbol: string, fromDate: ISODate, toDate: ISODate): Promise<unknown>;
}

export interface TopUpResult {
  ok: boolean;
  message: string;
  lastDate: ISODate;
  newDays: ISODate[];
  realChains: number;
  modeledChains: number;
}

const SCHWAB_NOTE =
  'Days after the DoltHub data: Schwab market data (read-only), topped up on this computer.';

function divYieldOn(divs: { exDate: ISODate; amount: number }[], date: ISODate, spot: number): number {
  const year = divs.filter((d) => d.exDate <= date && d.exDate > addDays(date, -365));
  const sum = year.reduce((a, d) => a + d.amount, 0);
  return spot > 0 ? sum / spot : 0;
}

export async function schwabTopUp(opts: {
  gameDbPath: string;
  api: SchwabMarketApi;
  now?: Date;
  log?: (m: string) => void;
  progress?: (stage: string, f: number) => void;
}): Promise<TopUpResult> {
  const log = opts.log ?? (() => undefined);
  const progress = opts.progress ?? (() => undefined);
  const closed = closedThrough(opts.now ?? new Date());
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
    return { ...none('Schwab top-up needs the real market data. Build it first.'), ok: false };
  }
  if (closed.date <= meta.lastDate) {
    src.close();
    return none(`Already up to date through ${meta.lastDate}.`);
  }

  // Read what's there first (the source is read-only), then write.
  const symbols = await src.symbols();
  const histFrom = addDays(meta.lastDate, -400);
  const rates = await src.rates(addDays(meta.lastDate, -30), meta.lastDate);
  const rate = rates.at(-1)?.r3m ?? 0.02;
  const plan: {
    symbol: string;
    oldBars: Bar[];
    newBars: Bar[];
    prior: Chain | null;
    chainJson: unknown;
    divs: { exDate: ISODate; amount: number }[];
  }[] = [];
  for (const [i, s] of symbols.entries()) {
    progress('Schwab: prices and chains', i / Math.max(1, symbols.length));
    try {
      const candles = mapCandles(await opts.api.priceHistory(s.symbol, addDays(meta.lastDate, -10)));
      const newBars = candles.filter((b) => b.date > meta.lastDate && b.date <= closed.date);
      if (!newBars.length) continue;
      const oldBars = await src.bars(s.symbol, histFrom, meta.lastDate);
      const prior = await src.chain(s.symbol, meta.lastDate);
      const chainJson =
        closed.chainIsClose && newBars.at(-1)?.date === closed.date
          ? await opts.api.chain(s.symbol, closed.date, addDays(closed.date, 70))
          : null;
      const divs = await src.dividends(s.symbol, addDays(closed.date, -365), closed.date);
      plan.push({ symbol: s.symbol, oldBars, newBars, prior, chainJson, divs });
    } catch (e) {
      log(`Schwab: ${s.symbol} skipped (${(e as Error).message})`);
    }
  }
  const iv30Hist = new Map<string, Map<ISODate, number>>();
  for (const p of plan) {
    const rows = src.db
      .prepare('SELECT date, iv30 FROM vol WHERE symbol = ? AND iv30 IS NOT NULL AND date >= ?')
      .all(p.symbol, encDate(histFrom)) as { date: number; iv30: number }[];
    iv30Hist.set(p.symbol, new Map(rows.map((r) => [decDate(r.date), r.iv30] as const)));
  }
  src.close();
  if (!plan.length) return none(`Schwab had no finished trading days after ${meta.lastDate} yet.`);

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
        if (bar.date === closed.date && p.chainJson)
          chain = mapChain(p.chainJson, p.symbol, bar.date, bar.close, rate, dy);
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
      notes: [...meta.notes.filter((n) => n !== SCHWAB_NOTE), SCHWAB_NOTE],
    });
  } finally {
    writer.close();
  }
  const days = [...newDays].sort();
  const lastDate = days.at(-1) ?? meta.lastDate;
  progress('Schwab: done', 1);
  const detail = closed.chainIsClose
    ? ''
    : " (the market is open, so today's candle and chain wait for the close)";
  return {
    ok: true,
    message: `Schwab: added ${days.length} day${days.length === 1 ? '' : 's'} through ${lastDate} for ${plan.length} tickers${detail}.`,
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
