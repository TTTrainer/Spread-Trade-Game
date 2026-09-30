/**
 * PULL FROM SCHWAB: asks Schwab's read-only market data for every ticker's daily candles (the
 * whole history on the first pull, the last couple of weeks after that) and, after the close,
 * today's option chain, and saves it all in schwab.db. Nothing here touches accounts or orders.
 */

import { addDays, type ISODate } from '../../src/engine/calendar';
import type { Bar } from '../../src/engine/market/types';
import { median } from '../lib/derived';
import { closedThrough, mapCandles, mapChain } from './map';
import { isIndexSeries, SchwabStore, TBILL_SYMBOL, VIX_SYMBOL } from './store';

/** The two read-only calls (a fake in tests, fetch against Schwab in the game). */
export interface SchwabMarketApi {
  priceHistory(symbol: string, fromDate: ISODate): Promise<unknown>;
  chain(symbol: string, fromDate: ISODate, toDate: ISODate): Promise<unknown>;
}

export interface PullResult {
  ok: boolean;
  message: string;
  closedThrough: ISODate;
  newCandles: number;
  chains: number;
  failed: string[];
}

/** Candles start here on the first pull, the same start as the DoltHub build. */
export const HISTORY_FROM: ISODate = '2018-01-01';

/**
 * Schwab's candles are split-adjusted. When a stored close and the fresh one for the same day
 * disagree by a steady factor, a split happened: the whole history is fetched again.
 */
export function splitRatio(stored: Bar[], fresh: Bar[]): number | null {
  const byDate = new Map(stored.map((b) => [b.date, b.close] as const));
  const ratios = fresh.filter((b) => byDate.has(b.date)).map((b) => (byDate.get(b.date) as number) / b.close);
  const r = median(ratios);
  if (r === null || ratios.length < 2) return null;
  return Math.abs(r - 1) > 0.15 ? Math.round(r * 1000) / 1000 : null;
}

/** 13-week T-bill index to a decimal rate. Some feeds quote percent (4.3), some ten times it (43). */
export function tbillToRate(values: number[]): (v: number) => number {
  const m = median(values) ?? 0;
  const scale = m > 20 ? 1000 : 100;
  return (v: number) => Math.max(0, Math.min(0.2, v / scale));
}

export async function schwabPull(opts: {
  storePath: string;
  api: SchwabMarketApi;
  symbols: string[];
  now?: Date;
  log?: (m: string) => void;
  progress?: (stage: string, f: number) => void;
}): Promise<PullResult> {
  const log = opts.log ?? (() => undefined);
  const progress = opts.progress ?? (() => undefined);
  const now = opts.now ?? new Date();
  const closed = closedThrough(now);
  const store = new SchwabStore(opts.storePath);
  const list = [...new Set([...opts.symbols, VIX_SYMBOL, TBILL_SYMBOL])];
  let newCandles = 0;
  let chains = 0;
  const failed: string[] = [];
  try {
    // Rates first: the chain mapping solves missing IVs with them.
    const order = [TBILL_SYMBOL, ...list.filter((s) => s !== TBILL_SYMBOL)];
    const storedBills = store.candles(TBILL_SYMBOL);
    let rate = storedBills.length
      ? tbillToRate(storedBills.map((b) => b.close))(storedBills[storedBills.length - 1].close)
      : 0.04;
    for (const [i, symbol] of order.entries()) {
      progress('Schwab: prices and option chains', i / order.length);
      try {
        const last = store.lastCandleDate(symbol);
        const wantChain =
          !isIndexSeries(symbol) && closed.chainIsClose && !store.hasChain(symbol, closed.date);
        if (last && last >= closed.date && !wantChain) continue;
        const from = last ? addDays(last, -14) : HISTORY_FROM;
        let bars = mapCandles(await opts.api.priceHistory(symbol, from)).filter((b) => b.date <= closed.date);
        if (last) {
          const ratio = splitRatio(store.candles(symbol, from, last), bars);
          if (ratio) {
            log(`Schwab: ${symbol} split (x${ratio}); fetching its whole history again`);
            bars = mapCandles(await opts.api.priceHistory(symbol, HISTORY_FROM)).filter(
              (b) => b.date <= closed.date,
            );
            const firstNew = bars.find((b) => b.date > last)?.date ?? closed.date;
            store.replaceCandles(symbol, bars);
            store.recordSplit(symbol, firstNew, ratio);
          }
        }
        newCandles += store.putCandles(symbol, bars);
        if (symbol === TBILL_SYMBOL && bars.length) {
          const toRate = tbillToRate(bars.map((b) => b.close));
          rate = toRate(bars[bars.length - 1].close);
        }
        const lastBar = store.candles(symbol, closed.date, closed.date)[0];
        if (wantChain && lastBar) {
          const json = await opts.api.chain(symbol, closed.date, addDays(closed.date, 70));
          const chain = mapChain(json, symbol, closed.date, lastBar.close, rate, 0);
          if (chain) {
            store.putChain(chain, now.toISOString());
            chains++;
          }
        }
      } catch (e) {
        failed.push(symbol);
        log(`Schwab: ${symbol} skipped (${(e as Error).message})`);
        // A refused login fails every call the same way: stop instead of trying the rest.
        if (/401|log ?in/i.test((e as Error).message)) throw e;
      }
    }
    const tickers = opts.symbols.filter((s) => !failed.includes(s)).length;
    const note = closed.chainIsClose
      ? `Saved prices through ${closed.date} and ${chains} option chain${chains === 1 ? '' : 's'} at that close.`
      : `Saved prices through ${closed.date}. The market is open, so today's option chains wait for the close (after 4:15 pm New York time).`;
    store.logPull({
      at: now.toISOString(),
      closedThrough: closed.date,
      symbols: tickers,
      newCandles,
      chains,
      note,
    });
    progress('Schwab: saved', 1);
    return {
      ok: tickers > 0,
      message: `Schwab: ${note}${failed.length ? ` Skipped: ${failed.join(', ')}.` : ''}`,
      closedThrough: closed.date,
      newCandles,
      chains,
      failed,
    };
  } finally {
    store.close();
  }
}
