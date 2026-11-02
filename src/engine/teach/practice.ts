/**
 * The tutorial's worked example. Before a new player builds a trade, Ines shows one thing a seller
 * looks for on the chart: a floor the stock keeps bouncing off (sell a put spread below it) or a
 * ceiling it keeps topping out at (sell a call spread above it). The bars come from the MarketView,
 * so nothing here can see past today.
 */

import type { Bar } from '../market/types';

export interface PracticeLevel {
  kind: 'floor' | 'ceiling';
  /** The level itself: the lowest low of the bounces (floor) or the highest high (ceiling). */
  price: number;
  /** The days the stock turned at this level, oldest first. */
  touches: { date: string; price: number }[];
}

/** Which way the chart leans: above or below its 20-day average close. */
export function practiceLean(bars: Bar[]): 'up' | 'down' {
  const last = bars.at(-1);
  if (!last) return 'up';
  const tail = bars.slice(-20);
  const avg = tail.reduce((a, b) => a + b.close, 0) / tail.length;
  return last.close >= avg ? 'up' : 'down';
}

/**
 * The floor under an up-leaning chart (or the ceiling over a down-leaning one): swing lows (highs)
 * within 1.5% of each other, the cluster with the most turns, nearest the price on a tie. With no
 * level touched twice, the lowest low (highest high) of the last 20 days stands in.
 */
export function practiceLevel(
  bars: Bar[],
  lean: 'up' | 'down',
  lookback = 60,
  swing = 3,
): PracticeLevel | null {
  const slice = bars.slice(-lookback);
  const last = slice.at(-1);
  if (!last || slice.length < swing * 2 + 2) return null;
  const floor = lean === 'up';
  const val = (b: Bar) => (floor ? b.low : b.high);
  // Leave the newest days out: a turn needs `swing` days after it to count.
  const pivots: { date: string; price: number }[] = [];
  for (let i = swing; i < slice.length - swing; i++) {
    let turn = true;
    for (let j = i - swing; j <= i + swing && turn; j++)
      if (floor ? slice[j].low < slice[i].low : slice[j].high > slice[i].high) turn = false;
    const p = val(slice[i]);
    if (turn && (floor ? p < last.close : p > last.close)) pivots.push({ date: slice[i].date, price: p });
  }
  const tol = last.close * 0.015;
  const clusters: { date: string; price: number }[][] = [];
  for (const p of [...pivots].sort((a, b) => a.price - b.price)) {
    const c = clusters.find((x) => Math.abs(x[0].price - p.price) <= tol);
    if (c) c.push(p);
    else clusters.push([p]);
  }
  const level = (c: { price: number }[]) =>
    floor ? Math.min(...c.map((x) => x.price)) : Math.max(...c.map((x) => x.price));
  const best = clusters
    .filter((c) => c.length >= 2)
    .sort(
      (a, b) => b.length - a.length || Math.abs(level(a) - last.close) - Math.abs(level(b) - last.close),
    )[0];
  if (best)
    return {
      kind: floor ? 'floor' : 'ceiling',
      price: level(best),
      touches: [...best].sort((a, b) => a.date.localeCompare(b.date)),
    };
  const recent = slice.slice(-20);
  const pick = recent.reduce((a, b) => (floor ? (b.low < a.low ? b : a) : b.high > a.high ? b : a));
  if (floor ? pick.low >= last.close : pick.high <= last.close) return null;
  return {
    kind: floor ? 'floor' : 'ceiling',
    price: val(pick),
    touches: [{ date: pick.date, price: val(pick) }],
  };
}

/** The POP the tutorial nudges a first trade toward: about four wins in five. */
export const PRACTICE_POP = 0.8;

/**
 * The example's short strike: of the candidates (delta step, short strike, POP), the one with the
 * most credit whose strike sits beyond the level with a POP near 80%; failing that, the POP
 * closest to 80%.
 */
export function practicePick<T extends { strike: number; pop: number }>(
  level: PracticeLevel,
  options: T[],
): T | null {
  if (!options.length) return null;
  const beyond = (o: T) => (level.kind === 'floor' ? o.strike < level.price : o.strike > level.price);
  const good = options.filter((o) => beyond(o) && o.pop >= PRACTICE_POP - 0.05);
  // Lower POP = closer to the price = more credit: the boldest strike that still clears the bar.
  if (good.length) return good.reduce((a, b) => (b.pop < a.pop ? b : a));
  return options.reduce((a, b) => (Math.abs(b.pop - PRACTICE_POP) < Math.abs(a.pop - PRACTICE_POP) ? b : a));
}
