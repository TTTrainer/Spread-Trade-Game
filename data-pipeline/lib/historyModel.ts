/**
 * Option chains for days with prices but no real chain (Schwab serves no option history). A
 * clearly labeled model (source 'modeled', shown as MODEL): implied vol from the stock's own
 * trailing realized volatility, lifted by the usual implied-over-realized premium, with an equity
 * skew and a term structure that mean-reverts from recent to longer-run volatility. Bid/ask
 * widths widen when the VIX is high.
 *
 * It sees only closes dated on or before the day it prices, so it can never leak the future.
 */

import { listedExpirations, type ISODate } from '../../src/engine/calendar';
import type { Chain, OptionQuote, OptionRight } from '../../src/engine/market/types';
import { buildChain, quoteOption, strikeGrid, type SurfaceModel } from '../../src/engine/pricing/chainModel';

/** Trailing closes this many deep are enough for every estimate below. */
export const HISTORY_DEPTH = 130;

export interface HistoryModelInput {
  /** Closes up to and including the day being priced, oldest first. */
  closes: number[];
  vix: number | null;
  isEtf: boolean;
}

function annualizedVol(closes: number[], n: number): number | null {
  const k = Math.min(n, closes.length - 1);
  if (k < 5) return null;
  let s = 0;
  let s2 = 0;
  for (let i = closes.length - k; i < closes.length; i++) {
    const r = Math.log(closes[i] / closes[i - 1]);
    s += r;
    s2 += r * r;
  }
  const mean = s / k;
  return Math.sqrt(Math.max(0, (s2 - k * mean * mean) / (k - 1)) * 252);
}

export interface HistorySurface extends SurfaceModel {
  /** At-the-money implied vol for a horizon in years. */
  atm(t: number): number;
}

export function historySurface(inp: HistoryModelInput): HistorySurface {
  const c = inp.closes;
  const hv10 = annualizedVol(c, 10);
  const hv21 = annualizedVol(c, 21);
  const hv63 = annualizedVol(c, 63);
  const hv126 = annualizedVol(c, 126);
  const floor = inp.isEtf ? 0.08 : 0.14;
  const near = Math.max(floor, 0.5 * (hv10 ?? hv21 ?? 0.3) + 0.5 * (hv21 ?? hv10 ?? 0.3));
  const far = Math.max(floor, 0.5 * (hv63 ?? near) + 0.5 * (hv126 ?? hv63 ?? near));
  // Index options carry a bigger premium and a steeper put skew than single stocks.
  const vrp = inp.isEtf ? 1.2 : 1.12;
  const skew = inp.isEtf ? -0.25 : -0.16;
  const smile = inp.isEtf ? 0.04 : 0.03;
  const tau = 20 / 252;
  const atm = (t: number): number => {
    const tt = Math.max(t, 1 / 365);
    // Average forward variance as recent vol decays toward the longer-run level.
    const w = (1 - Math.exp(-tt / tau)) / (tt / tau);
    const v = far * far + (near * near - far * far) * w;
    return Math.min(3, Math.sqrt(Math.max(1e-6, v)) * vrp);
  };
  const widen = Math.min(2, Math.max(0.85, 1 + ((inp.vix ?? 20) - 20) / 45));
  const spreadFactor = inp.isEtf ? 0.5 : 1;
  return {
    atm,
    iv: (_exp, strike, t, fwd) => {
      const a = atm(t);
      const m = Math.max(-4, Math.min(4, Math.log(strike / fwd) / (a * Math.sqrt(Math.max(t, 1 / 365)))));
      return a * Math.max(0.55, Math.min(2.6, 1 + skew * m + smile * m * m));
    },
    halfSpread: (price, absDelta) =>
      spreadFactor *
      (0.004 + 0.016 * Math.pow(Math.max(price, 0), 0.72)) *
      widen *
      (absDelta > 0.85 ? 1.6 : 1),
  };
}

export interface HistoryChainParams extends HistoryModelInput {
  symbol: string;
  date: ISODate;
  rate: number;
  divYield: number;
}

export function historyChain(p: HistoryChainParams): Chain {
  const spot = p.closes[p.closes.length - 1];
  return buildChain({
    symbol: p.symbol,
    date: p.date,
    spot,
    rate: p.rate,
    divYield: p.divYield,
    expirations: listedExpirations(p.date, 1, 70, true),
    strikes: () => strikeGrid(spot, 0.3),
    model: historySurface(p),
    source: 'modeled',
  });
}

/** One contract's modeled quote on a day (for a position's history across many days). */
export function historyQuote(
  p: HistoryChainParams,
  key: { expiration: ISODate; strike: number; right: OptionRight },
): OptionQuote {
  return quoteOption(key.right, key.expiration, key.strike, {
    date: p.date,
    spot: p.closes[p.closes.length - 1],
    rate: p.rate,
    divYield: p.divYield,
    model: historySurface(p),
    source: 'modeled',
  });
}
