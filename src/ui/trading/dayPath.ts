/**
 * The day playback: how a finished daily candle is replayed on screen as if it were forming.
 *
 * Presentation only. The engine has already settled the day from real data; this just walks the
 * candle from its open through both extremes to its close so the player can watch it happen. The
 * order of the extremes is a guess (daily bars don't record it): up days dip first, down days pop
 * first, the common shape. Every path touches the real high and low and ends exactly at the close,
 * and the P/L shown along the way lands exactly on the settled P/L.
 */

import { hashString } from '../../engine/rng';

export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Waypoints from open to close, visiting the low and the high, with a small seeded wobble. */
export function intradayPath(bar: OHLC, seed: string): number[] {
  const up = bar.close >= bar.open;
  const first = up ? bar.low : bar.high;
  const second = up ? bar.high : bar.low;
  const h = hashString(seed);
  const range = Math.max(1e-9, bar.high - bar.low);
  // A retrace between the extremes and one before the close, inside the day's range.
  const wob = (k: number) => ((((h >>> (k * 5)) & 31) / 31) * 0.3 + 0.2) * range;
  const mid1 = clamp(up ? first + wob(1) : first - wob(1), bar.low, bar.high);
  const mid2 = clamp(up ? second - wob(2) : second + wob(2), bar.low, bar.high);
  return [bar.open, first, mid1, second, mid2, bar.close];
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Price at progress t (0..1) along the path. */
export function priceAt(path: number[], t: number): number {
  if (t <= 0) return path[0];
  if (t >= 1) return path[path.length - 1];
  const seg = (path.length - 1) * t;
  const i = Math.floor(seg);
  return path[i] + (path[i + 1] - path[i]) * ease(seg - i);
}

/** The candle as drawn at progress t: its range so far and its current price. */
export function formingBar(path: number[], t: number): OHLC {
  const now = priceAt(path, t);
  const seg = (path.length - 1) * Math.min(1, Math.max(0, t));
  const seen = path.slice(0, Math.floor(seg) + 1).concat(now);
  return { open: path[0], high: Math.max(...seen), low: Math.min(...seen), close: now };
}

/**
 * How close the day came to a short strike: 1 when price touched it or sits past it (below a
 * short put, above a short call), rising from 0 as the nearest extreme comes within 2% of it.
 * The side matters: a stock that gapped far below a short put is not "safe" for being far away.
 */
export function strikeTension(shorts: { strike: number; right: 'C' | 'P' }[], bar: OHLC): number {
  let best = 0;
  for (const { strike: k, right } of shorts) {
    const reached = right === 'P' ? bar.low <= k : bar.high >= k;
    if (reached) return 1;
    const d = (right === 'P' ? bar.low - k : k - bar.high) / Math.max(1e-9, k);
    best = Math.max(best, 1 - d / 0.02);
  }
  return Math.max(0, best);
}

/**
 * Open P/L (cents) while the candle forms: yesterday's P/L plus what delta and time decay would
 * have made at this price, blended into the settled number over the last stretch so it lands
 * exactly on it.
 */
export function livePl(
  o: { prevCents: number; finalCents: number; deltaDollars: number; thetaDollars: number; prevClose: number },
  price: number,
  t: number,
): number {
  if (t >= 1) return o.finalCents;
  const est = o.prevCents + Math.round((o.deltaDollars * (price - o.prevClose) + o.thetaDollars * t) * 100);
  const w = t < 0.7 ? 0 : ((t - 0.7) / 0.3) ** 2;
  return Math.round(est + (o.finalCents - est) * w);
}
