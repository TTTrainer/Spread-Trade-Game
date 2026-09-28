/**
 * Technical indicators. Every function takes only the bars it is given, and the
 * MarketView only ever hands out bars up to the current simulated day, so an
 * indicator cannot see the future. Outputs align with the input (null while warming up).
 */

import type { Bar } from './types';

export type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (prev === null) {
      sum += values[i];
      if (i === period - 1) {
        prev = sum / period;
        out[i] = prev;
      }
    } else {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(closes: number[], period = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(0, ch)) / period;
    loss = (loss * (period - 1) + Math.max(0, -ch)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export interface MacdPoint {
  macd: number | null;
  signal: number | null;
  hist: number | null;
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9): MacdPoint[] {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line: number[] = [];
  const idx: number[] = [];
  const out: MacdPoint[] = closes.map(() => ({ macd: null, signal: null, hist: null }));
  for (let i = 0; i < closes.length; i++) {
    const fi = f[i];
    const si = s[i];
    if (fi !== null && si !== null) {
      line.push(fi - si);
      idx.push(i);
      out[i].macd = fi - si;
    }
  }
  const sig = ema(line, signal);
  for (let j = 0; j < line.length; j++) {
    const sj = sig[j];
    if (sj !== null) {
      out[idx[j]].signal = sj;
      out[idx[j]].hist = line[j] - sj;
    }
  }
  return out;
}

export interface Band {
  mid: number | null;
  upper: number | null;
  lower: number | null;
}

export function bollinger(closes: number[], period = 20, mult = 2): Band[] {
  const mids = sma(closes, period);
  return closes.map((_, i) => {
    const m = mids[i];
    if (m === null) return { mid: null, upper: null, lower: null };
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (closes[j] - m) ** 2;
    const sd = Math.sqrt(v / period);
    return { mid: m, upper: m + mult * sd, lower: m - mult * sd };
  });
}

export function trueRanges(bars: Bar[]): number[] {
  return bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
}

/** Wilder's ATR. */
export function atr(bars: Bar[], period = 14): Series {
  const tr = trueRanges(bars);
  const out: Series = new Array(bars.length).fill(null);
  if (bars.length < period) return out;
  let a = 0;
  for (let i = 0; i < period; i++) a += tr[i];
  a /= period;
  out[period - 1] = a;
  for (let i = period; i < bars.length; i++) {
    a = (a * (period - 1) + tr[i]) / period;
    out[i] = a;
  }
  return out;
}

/** Wilder's ADX(14): trend strength regardless of direction. */
export function adx(bars: Bar[], period = 14): Series {
  const n = bars.length;
  const out: Series = new Array(n).fill(null);
  if (n < period * 2 + 1) return out;
  const tr = trueRanges(bars);
  let trS = 0;
  let pS = 0;
  let mS = 0;
  const dx: number[] = [];
  for (let i = 1; i < n; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    const pdm = up > down && up > 0 ? up : 0;
    const mdm = down > up && down > 0 ? down : 0;
    if (i <= period) {
      trS += tr[i];
      pS += pdm;
      mS += mdm;
    } else {
      trS = trS - trS / period + tr[i];
      pS = pS - pS / period + pdm;
      mS = mS - mS / period + mdm;
    }
    if (i >= period) {
      const pdi = trS === 0 ? 0 : (100 * pS) / trS;
      const mdi = trS === 0 ? 0 : (100 * mS) / trS;
      const sum = pdi + mdi;
      dx.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
      const k = dx.length;
      if (k === period) {
        out[i] = dx.reduce((a, b) => a + b, 0) / period;
      } else if (k > period) {
        const prev = out[i - 1] ?? 0;
        out[i] = (prev * (period - 1) + dx[k - 1]) / period;
      }
    }
  }
  return out;
}

export function keltner(bars: Bar[], period = 20, mult = 1.5): Band[] {
  const closes = bars.map((b) => b.close);
  const mids = ema(closes, period);
  const a = atr(bars, period);
  return bars.map((_, i) => {
    const m = mids[i];
    const r = a[i];
    if (m === null || r === null) return { mid: null, upper: null, lower: null };
    return { mid: m, upper: m + mult * r, lower: m - mult * r };
  });
}

/** Annualized close-to-close historical volatility. */
export function historicalVol(closes: number[], period = 20): Series {
  const out: Series = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    let s = 0;
    let s2 = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const r = Math.log(closes[j] / closes[j - 1]);
      s += r;
      s2 += r * r;
    }
    const mean = s / period;
    const variance = (s2 - period * mean * mean) / (period - 1);
    out[i] = Math.sqrt(Math.max(0, variance) * 252);
  }
  return out;
}

/** Slope of the 50-day SMA over the last `lookback` days, in % of price per day. */
export function smaSlopePct(closes: number[], period = 50, lookback = 10): number | null {
  const s = sma(closes, period);
  const last = s[s.length - 1];
  const prev = s[s.length - 1 - lookback];
  if (last === null || prev === null || prev === undefined) return null;
  return ((last - prev) / prev / lookback) * 100;
}

/** Volume today relative to its 20-day average. */
export function relativeVolume(bars: Bar[], period = 20): Series {
  const vols = bars.map((b) => b.volume);
  const avg = sma(vols, period);
  return bars.map((b, i) => {
    const prev = i > 0 ? avg[i - 1] : null;
    return prev ? b.volume / prev : null;
  });
}

/** Swing-point support/resistance levels from the visible history, strongest first. */
export function supportResistance(
  bars: Bar[],
  lookback = 120,
  swing = 3,
  maxLevels = 4,
): { price: number; touches: number; kind: 'support' | 'resistance' }[] {
  const slice = bars.slice(-lookback);
  if (slice.length < swing * 2 + 1) return [];
  const last = slice[slice.length - 1].close;
  const pivots: number[] = [];
  for (let i = swing; i < slice.length - swing; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - swing; j <= i + swing; j++) {
      if (slice[j].high > slice[i].high) isHigh = false;
      if (slice[j].low < slice[i].low) isLow = false;
    }
    if (isHigh) pivots.push(slice[i].high);
    if (isLow) pivots.push(slice[i].low);
  }
  const tol = last * 0.015;
  const clusters: { price: number; touches: number }[] = [];
  for (const p of pivots.sort((a, b) => a - b)) {
    const c = clusters.find((x) => Math.abs(x.price - p) <= tol);
    if (c) {
      c.price = (c.price * c.touches + p) / (c.touches + 1);
      c.touches++;
    } else clusters.push({ price: p, touches: 1 });
  }
  return clusters
    .sort((a, b) => b.touches - a.touches)
    .slice(0, maxLevels)
    .map((c) => ({ ...c, kind: c.price <= last ? 'support' : 'resistance' }));
}

/** Last index where MACD crossed its signal line, and the direction of the cross. */
export function lastMacdCross(points: MacdPoint[]): { index: number; dir: 'up' | 'down' } | null {
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i - 1].hist;
    const b = points[i].hist;
    if (a === null || b === null) return null;
    if (a <= 0 && b > 0) return { index: i, dir: 'up' };
    if (a >= 0 && b < 0) return { index: i, dir: 'down' };
  }
  return null;
}

export function last<T>(xs: T[]): T | undefined {
  return xs[xs.length - 1];
}
