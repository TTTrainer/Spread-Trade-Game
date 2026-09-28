/**
 * Trade metrics from real quotes: payoff at expiration and today (T+0), max profit and loss,
 * breakevens, probability of profit, R:R, Greeks and their plain-English readings.
 * Prices are per share per unit (one contract of each leg); multiply by 100 for dollars.
 */

import { diffDays, type ISODate } from '../calendar';
import { bsm, normCdf } from '../pricing/bsm';
import type { Chain, OptionQuote } from '../market/types';
import { findQuote, mid, optionLegs } from './structures';
import type { Leg, OptionLeg, StructureDef } from './types';

export type PriceMode = 'mid' | 'natural';

export interface LegQuote {
  leg: Leg;
  quote: OptionQuote | null;
}

export function legQuotes(legs: Leg[], chain: Chain): LegQuote[] {
  return legs.map((leg) => ({ leg, quote: leg.kind === 'option' ? (findQuote(chain, leg) ?? null) : null }));
}

/**
 * Net price to open (positive = you pay a debit, negative = you collect a credit).
 * Natural buys at the ask and sells at the bid.
 */
export function netOpenPrice(legs: Leg[], chain: Chain, mode: PriceMode): number | null {
  let net = 0;
  for (const { leg, quote } of legQuotes(legs, chain)) {
    if (leg.kind === 'stock') {
      net += leg.ratio * chain.spot;
      continue;
    }
    if (!quote) return null;
    const px = mode === 'mid' ? mid(quote) : leg.ratio > 0 ? quote.ask : quote.bid;
    net += leg.ratio * px;
  }
  return net;
}

/** Net price received to close the legs (the mirror trade): sells longs at the bid, buys shorts at the ask. */
export function netClosePrice(legs: Leg[], chain: Chain, mode: PriceMode): number | null {
  let net = 0;
  for (const { leg, quote } of legQuotes(legs, chain)) {
    if (leg.kind === 'stock') {
      net += leg.ratio * chain.spot;
      continue;
    }
    if (!quote) return null;
    const px = mode === 'mid' ? mid(quote) : leg.ratio > 0 ? quote.bid : quote.ask;
    net += leg.ratio * px;
  }
  return net;
}

export interface PricingEnv {
  date: ISODate;
  rate: number;
  divYield: number;
  /** IV per option leg (defaults to 30% if a leg has no quote). */
  ivOf: (leg: OptionLeg) => number;
}

export function envFromChain(chain: Chain, rate: number, divYield = 0): PricingEnv {
  return {
    date: chain.date,
    rate,
    divYield,
    ivOf: (leg) => findQuote(chain, leg)?.iv ?? atmIv(chain, leg.expiration) ?? 0.3,
  };
}

export function atmIv(chain: Chain, expiration: ISODate): number | null {
  const qs = chain.quotes.filter((q) => q.expiration === expiration);
  if (!qs.length) return null;
  let best = qs[0];
  for (const q of qs) if (Math.abs(q.strike - chain.spot) < Math.abs(best.strike - chain.spot)) best = q;
  const pair = qs.filter((q) => q.strike === best.strike);
  return pair.reduce((a, q) => a + q.iv, 0) / pair.length;
}

/** Theoretical value of the legs at a price and date (expired legs at intrinsic). */
export function legsValue(legs: Leg[], spot: number, at: ISODate, env: PricingEnv, ivShift = 0): number {
  let v = 0;
  for (const leg of legs) {
    if (leg.kind === 'stock') {
      v += leg.ratio * spot;
      continue;
    }
    const t = Math.max(0, diffDays(at, leg.expiration)) / 365;
    if (t <= 0) {
      v += leg.ratio * (leg.right === 'C' ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot));
    } else {
      const vol = Math.max(0.01, env.ivOf(leg) + ivShift);
      v += leg.ratio * bsm({ right: leg.right, spot, strike: leg.strike, t, vol, rate: env.rate, divYield: env.divYield }).price;
    }
  }
  return v;
}

export function frontExpiration(legs: Leg[]): ISODate | null {
  const exps = optionLegs(legs).map((l) => l.expiration).sort();
  return exps[0] ?? null;
}

/** P/L per share per unit at the front expiration (later legs valued with today's IV). */
export function payoffAtExpiry(legs: Leg[], entryNet: number, spot: number, env: PricingEnv): number {
  const fe = frontExpiration(legs);
  return legsValue(legs, spot, fe ?? env.date, env) - entryNet;
}

export function payoffNow(legs: Leg[], entryNet: number, spot: number, env: PricingEnv, daysForward = 0, ivShift = 0): number {
  const at = new Date(Date.parse(env.date) + daysForward * 86400000).toISOString().slice(0, 10);
  return legsValue(legs, spot, at, env, ivShift) - entryNet;
}

const singleExpiry = (legs: Leg[]) => new Set(optionLegs(legs).map((l) => l.expiration)).size <= 1;

/** Price grid for scans: every strike (the kinks) plus a dense band around spot. */
function priceGrid(legs: Leg[], spot: number): number[] {
  const pts = new Set<number>([spot * 0.001, spot * 5]);
  for (const l of optionLegs(legs)) {
    pts.add(l.strike);
    pts.add(l.strike * 0.999);
    pts.add(l.strike * 1.001);
  }
  const dense = singleExpiry(legs) ? 60 : 400;
  for (let i = 0; i <= dense; i++) pts.add(spot * (0.4 + (1.2 * i) / dense));
  return [...pts].sort((a, b) => a - b);
}

export interface TradeMetrics {
  entryNet: number; // per share per unit, + debit / - credit
  credit: boolean;
  maxProfit: number | null; // per share per unit; null = unlimited
  maxLoss: number; // per share per unit, positive number
  breakevens: number[];
  pop: number; // 0..1
  rewardToRisk: number | null; // maxProfit / maxLoss
  width: number; // widest distance between short and long strikes on a side (verticals, condors)
  greeks: { delta: number; gamma: number; theta: number; vega: number }; // per unit, dollars (x100 applied)
  expectedMove: number | null; // dollars, from the ATM straddle at the front expiration
}

export function expectedMove(chain: Chain, expiration: ISODate): number | null {
  const qs = chain.quotes.filter((q) => q.expiration === expiration);
  if (!qs.length) return null;
  let k = qs[0].strike;
  for (const q of qs) if (Math.abs(q.strike - chain.spot) < Math.abs(k - chain.spot)) k = q.strike;
  const c = findQuote(chain, { expiration, strike: k, right: 'C' });
  const p = findQuote(chain, { expiration, strike: k, right: 'P' });
  return c && p ? mid(c) + mid(p) : null;
}

export function spreadWidth(legs: Leg[]): number {
  const ol = optionLegs(legs);
  let w = 0;
  for (const right of ['P', 'C'] as const) {
    const side = ol.filter((l) => l.right === right);
    const shorts = side.filter((l) => l.ratio < 0);
    const longs = side.filter((l) => l.ratio > 0);
    for (const s of shorts) for (const l of longs) if (l.expiration === s.expiration) w = Math.max(w, Math.abs(l.strike - s.strike));
  }
  return w;
}

export function positionGreeks(legs: Leg[], chain: Chain): TradeMetrics['greeks'] {
  const g = { delta: 0, gamma: 0, theta: 0, vega: 0 };
  for (const { leg, quote } of legQuotes(legs, chain)) {
    if (leg.kind === 'stock') {
      g.delta += leg.ratio * 100;
      continue;
    }
    if (!quote) continue;
    g.delta += leg.ratio * quote.delta * 100;
    g.gamma += leg.ratio * quote.gamma * 100;
    g.theta += leg.ratio * quote.theta * 100;
    g.vega += leg.ratio * quote.vega * 100;
  }
  return g;
}

/** Probability the stock finishes where the payoff is positive (lognormal, risk-neutral drift). */
export function probabilityOfProfit(legs: Leg[], entryNet: number, env: PricingEnv, spot: number, sigma: number): number {
  const fe = frontExpiration(legs) ?? env.date;
  const t = Math.max(diffDays(env.date, fe), 0.5) / 365;
  const grid = priceGrid(legs, spot);
  const mu = Math.log(spot) + (env.rate - env.divYield - 0.5 * sigma * sigma) * t;
  const sd = sigma * Math.sqrt(t);
  const cdf = (x: number) => (x <= 0 ? 0 : normCdf((Math.log(x) - mu) / sd));
  let p = 0;
  let stretchStart = 0; // where the current same-sign stretch began
  let prevGrid = grid[0];
  let prevPos = payoffAtExpiry(legs, entryNet, grid[0], env) > 0;
  for (const x of grid) {
    const pos = payoffAtExpiry(legs, entryNet, x, env) > 0;
    if (pos !== prevPos) {
      // Refine the crossing between the two grid points, then count the positive stretch.
      const cross = bisectZero((s) => payoffAtExpiry(legs, entryNet, s, env), prevGrid, x);
      if (prevPos) p += cdf(cross) - cdf(stretchStart);
      stretchStart = cross;
      prevPos = pos;
    }
    prevGrid = x;
  }
  if (prevPos) p += 1 - cdf(stretchStart);
  return Math.min(1, Math.max(0, p));
}

function bisectZero(f: (x: number) => number, a: number, b: number): number {
  let lo = a;
  let hi = b;
  const flo = f(lo) > 0;
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (lo + hi);
    if (f(m) > 0 === flo) lo = m;
    else hi = m;
  }
  return 0.5 * (lo + hi);
}

export function computeMetrics(legs: Leg[], chain: Chain, def: StructureDef, rate: number, divYield = 0, entryNet?: number): TradeMetrics | null {
  const net = entryNet ?? netOpenPrice(legs, chain, 'mid');
  if (net === null) return null;
  const env = envFromChain(chain, rate, divYield);
  const grid = priceGrid(legs, chain.spot);
  let lo = Infinity;
  let hi = -Infinity;
  const vals = grid.map((s) => payoffAtExpiry(legs, net, s, env));
  for (const v of vals) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  // Rising payoff at the far right means unlimited upside (long calls/straddles).
  const n = grid.length;
  const slopeRight = (vals[n - 1] - vals[n - 2]) / (grid[n - 1] - grid[n - 2]);
  const unlimited = slopeRight > 0.5;
  const breakevens: number[] = [];
  for (let i = 1; i < n; i++) {
    if (vals[i - 1] > 0 !== vals[i] > 0) breakevens.push(bisectZero((s) => payoffAtExpiry(legs, net, s, env), grid[i - 1], grid[i]));
  }
  const fe = frontExpiration(legs);
  const shortLegs = optionLegs(legs).filter((l) => l.ratio < 0);
  const sigmaLegs = shortLegs.length ? shortLegs : optionLegs(legs);
  const sigma = sigmaLegs.length ? sigmaLegs.reduce((a, l) => a + env.ivOf(l), 0) / sigmaLegs.length : 0.3;
  const maxLoss = Math.max(0, -lo);
  const maxProfit = unlimited ? null : Math.max(0, hi);
  return {
    entryNet: net,
    credit: net < 0,
    maxProfit,
    maxLoss,
    breakevens: breakevens.map((b) => Math.round(b * 100) / 100),
    pop: probabilityOfProfit(legs, net, env, chain.spot, sigma),
    rewardToRisk: maxProfit === null ? null : maxLoss > 0 ? maxProfit / maxLoss : null,
    width: spreadWidth(legs),
    greeks: positionGreeks(legs, chain),
    expectedMove: fe ? expectedMove(chain, fe) : null,
  };
}

/** Plain-English Greeks for the stats panel ("you make about $6 a day from time decay"). */
export function plainGreeks(g: TradeMetrics['greeks'], units: number): string[] {
  const d = (x: number) => `$${Math.abs(Math.round(x * units)).toLocaleString('en-US')}`;
  const lines: string[] = [];
  lines.push(
    Math.abs(g.theta) < 0.05
      ? 'Time decay barely moves this trade.'
      : g.theta > 0
        ? `You make about ${d(g.theta)} a day from time decay.`
        : `Time decay costs you about ${d(g.theta)} a day.`,
  );
  lines.push(
    Math.abs(g.delta) < 0.5
      ? 'Small stock moves barely matter right now.'
      : `If the stock rises $1, you ${g.delta > 0 ? 'make' : 'lose'} about ${d(g.delta)}.`,
  );
  lines.push(
    Math.abs(g.vega) < 0.05
      ? 'Volatility changes barely matter.'
      : `If implied volatility drops 1 point, you ${g.vega < 0 ? 'make' : 'lose'} about ${d(g.vega)}.`,
  );
  if (Math.abs(g.gamma) > 0.01)
    lines.push(g.gamma < 0 ? 'Big moves hurt more the closer the stock gets to your short strike.' : 'Big moves in either direction help you.');
  return lines;
}
