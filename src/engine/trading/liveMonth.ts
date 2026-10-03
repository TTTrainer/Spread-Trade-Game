/**
 * Live mode plays the most recent month of the market: it starts LIVE_MONTH_DAYS trading days
 * before the latest close and plays forward to it. The market keeps making new days, so the month
 * never runs out: at the latest close the clock waits, and each new day of data plays on from there.
 */

import type { ISODate, SymbolInfo } from '../market/types';
import { streamFor } from '../rng';

export const LIVE_MONTH_DAYS = 20;
export const LIVE_LINEUP = 4;

/** The month's first day: LIVE_MONTH_DAYS trading days before the edge (or the earliest day there is). */
export function liveMonthStart(days: ISODate[], edge: ISODate, length = LIVE_MONTH_DAYS): ISODate {
  const upTo = days.filter((d) => d <= edge);
  if (!upTo.length) return edge;
  return upTo[Math.max(0, upTo.length - 1 - length)];
}

/**
 * The tickers dealt for a month: the benchmark first (the market itself), then a seeded pick of
 * stocks from the more liquid half that have option chains on the start date.
 */
export function pickLiveLineup(
  symbols: SymbolInfo[],
  benchmark: string | null,
  seed: string,
  start: ISODate,
  n = LIVE_LINEUP,
): string[] {
  const live = (s: SymbolInfo) => s.chainFirstDate <= start && s.lastDate >= start;
  const stocks = symbols
    .filter((s) => !s.isEtf && live(s))
    .sort((a, b) => (a.liquidity ?? 1) - (b.liquidity ?? 1) || a.symbol.localeCompare(b.symbol));
  const pool = stocks.slice(0, Math.max(n, Math.ceil(stocks.length / 2)));
  const picks = streamFor(seed, 'live-lineup').shuffle(pool).slice(0, n);
  const bench = benchmark ? symbols.find((s) => s.symbol === benchmark && live(s)) : undefined;
  return [...(bench ? [bench.symbol] : []), ...picks.map((s) => s.symbol)];
}

/** Where the clock is in the month: trading days played and in total (the total grows with new data). */
export function liveMonthProgress(
  days: ISODate[],
  start: ISODate,
  now: ISODate,
  edge: ISODate,
): { day: number; total: number; caughtUp: boolean } {
  const span = days.filter((d) => d > start && d <= edge);
  const day = span.filter((d) => d <= now).length;
  return { day, total: span.length, caughtUp: now >= edge };
}
