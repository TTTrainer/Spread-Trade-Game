/**
 * Blind mode. Inside a window the ticker becomes a codename, dates become "Day N", and
 * prices are rescaled as if the stock had split. A split changes no economics: strikes,
 * premiums and spot scale by f, contract counts scale inversely, and every percentage
 * (returns, IV, delta, POP) is unchanged. So the ledger stays truthful in blind mode.
 */

import type { ISODate } from '../calendar';
import type { Rng } from '../rng';
import type { Bar, Chain, ContractKey, Dividend, EarningsEvent, Fundamentals, OptionQuote } from './types';

/** Split-like factors only, so strikes stay round and fills stay on sensible ticks. */
export const SCALE_FACTORS = [0.1, 0.2, 0.25, 0.5, 1, 2, 4, 5, 10] as const;

export interface BlindTransform {
  realSymbol: string;
  displaySymbol: string;
  blind: boolean;
  hideDates: boolean;
  scale: number;
  /** Mirror the price path. Drills and SIM charts only: chain access throws when set. */
  flipBars: boolean;
  anchorDate: ISODate; // shown as Day 1
}

export function openTransform(symbol: string, anchorDate: ISODate): BlindTransform {
  return {
    realSymbol: symbol,
    displaySymbol: symbol,
    blind: false,
    hideDates: false,
    scale: 1,
    flipBars: false,
    anchorDate,
  };
}

const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXZ';
const VOWELS = 'AEIOUY';

/** Pronounceable 4-letter codename, e.g. "KOVA", "ZERT". */
export function codename(rng: Rng): string {
  const pattern = rng.pick(['CVCV', 'CVCC', 'CCVC', 'VCVC'] as const);
  return pattern
    .split('')
    .map((c) => (c === 'C' ? rng.pick(CONSONANTS.split('')) : rng.pick(VOWELS.split(''))))
    .join('');
}

/** Choose f so the displayed price lands in a plausible range; random among valid choices. */
export function chooseScale(price: number, rng: Rng, lo = 20, hi = 400): number {
  const valid = SCALE_FACTORS.filter((f) => price * f >= lo && price * f <= hi && f !== 1);
  if (valid.length === 0) {
    return SCALE_FACTORS.reduce(
      (best, f) =>
        Math.abs(Math.log((price * f) / 120)) < Math.abs(Math.log((price * best) / 120)) ? f : best,
      1,
    );
  }
  return rng.pick(valid);
}

export function blindTransform(
  symbol: string,
  anchorDate: ISODate,
  refPrice: number,
  rng: Rng,
  rescale = true,
): BlindTransform {
  return {
    realSymbol: symbol,
    displaySymbol: codename(rng),
    blind: true,
    hideDates: true,
    scale: rescale ? chooseScale(refPrice, rng) : 1,
    flipBars: false,
    anchorDate,
  };
}

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function scalePrice(t: BlindTransform, p: number): number {
  return t.scale === 1 ? p : r6(p * t.scale);
}

export function unscaleStrike(t: BlindTransform, displayStrike: number): number {
  return t.scale === 1 ? displayStrike : Math.round((displayStrike / t.scale) * 1000) / 1000;
}

export function toRealKey(t: BlindTransform, k: ContractKey): ContractKey {
  return { ...k, strike: unscaleStrike(t, k.strike) };
}

export function toDisplayKey(t: BlindTransform, k: ContractKey): ContractKey {
  return { ...k, strike: scalePrice(t, k.strike) };
}

export function transformBars(t: BlindTransform, bars: Bar[], flipAnchor?: number): Bar[] {
  let out = bars;
  if (t.flipBars && bars.length > 0) {
    // Mirror in log space around the anchor so a rally reads as a selloff of the same size.
    const a = flipAnchor ?? bars[bars.length - 1].close;
    const m = (x: number) => (a * a) / x;
    out = bars.map((b) => ({ ...b, open: m(b.open), close: m(b.close), high: m(b.low), low: m(b.high) }));
  }
  if (t.scale === 1) return out;
  return out.map((b) => ({
    ...b,
    open: scalePrice(t, b.open),
    high: scalePrice(t, b.high),
    low: scalePrice(t, b.low),
    close: scalePrice(t, b.close),
    volume: Math.round(b.volume / t.scale),
  }));
}

export function transformQuote(t: BlindTransform, q: OptionQuote): OptionQuote {
  if (t.scale === 1) return q;
  const f = t.scale;
  return {
    ...q,
    strike: scalePrice(t, q.strike),
    bid: r6(q.bid * f),
    ask: r6(q.ask * f),
    gamma: q.gamma / f,
    theta: q.theta * f,
    vega: q.vega * f,
    rho: q.rho * f,
  };
}

export function transformChain(t: BlindTransform, c: Chain): Chain {
  return {
    ...c,
    symbol: t.displaySymbol,
    spot: scalePrice(t, c.spot),
    quotes: t.scale === 1 ? c.quotes : c.quotes.map((q) => transformQuote(t, q)),
  };
}

export function transformDividend(t: BlindTransform, d: Dividend): Dividend {
  return { ...d, symbol: t.displaySymbol, amount: scalePrice(t, d.amount) };
}

export function transformEarnings(t: BlindTransform, e: EarningsEvent): EarningsEvent {
  const s = (x: number | null) => (x === null ? null : scalePrice(t, x));
  return { ...e, symbol: t.displaySymbol, estimate: s(e.estimate), actual: s(e.actual) };
}

export function transformFundamentals(t: BlindTransform, f: Fundamentals): Fundamentals {
  const s = (x: number | null) => (x === null ? null : scalePrice(t, x));
  return {
    ...f,
    symbol: t.displaySymbol,
    eps: s(f.eps),
    epsEstimate: s(f.epsEstimate),
    sharesOut: f.sharesOut === null ? null : Math.round(f.sharesOut / t.scale),
  };
}
