/**
 * What the analysts compute. Every function reads only data the player could see today: the
 * current chain, bars up to today, and positions already open.
 */

import { diffDays, type ISODate } from '../calendar';
import { lastMark } from '../lifecycle/position';
import type { Position } from '../lifecycle/types';
import type { Bar, Chain, OptionQuote } from '../market/types';

export interface TermPoint {
  expiration: ISODate;
  dte: number;
  iv: number;
}

function atmQuote(quotes: OptionQuote[], spot: number, right: 'C' | 'P'): OptionQuote | null {
  let best: OptionQuote | null = null;
  for (const q of quotes)
    if (q.right === right && (!best || Math.abs(q.strike - spot) < Math.abs(best.strike - spot))) best = q;
  return best;
}

/** At-the-money IV for each listed expiration (the Vol Surfer's term structure). */
export function termStructure(chain: Chain): TermPoint[] {
  const exps = [...new Set(chain.quotes.map((q) => q.expiration))].sort();
  const out: TermPoint[] = [];
  for (const e of exps) {
    const qs = chain.quotes.filter((q) => q.expiration === e);
    const c = atmQuote(qs, chain.spot, 'C');
    const p = atmQuote(qs, chain.spot, 'P');
    const ivs = [c?.iv, p?.iv].filter((x): x is number => typeof x === 'number' && x > 0);
    if (ivs.length)
      out.push({
        expiration: e,
        dte: diffDays(chain.date, e),
        iv: ivs.reduce((a, b) => a + b, 0) / ivs.length,
      });
  }
  return out;
}

/** Put/call skew at about 25 delta for one expiration (the Skew Doctor). */
export function skew25(
  chain: Chain,
  expiration: ISODate,
): { putIv: number; callIv: number; diffPts: number; richer: 'puts' | 'calls' | 'even' } | null {
  const qs = chain.quotes.filter((q) => q.expiration === expiration);
  const near = (right: 'C' | 'P') => {
    let best: OptionQuote | null = null;
    for (const q of qs)
      if (
        q.right === right &&
        (!best || Math.abs(Math.abs(q.delta) - 0.25) < Math.abs(Math.abs(best.delta) - 0.25))
      )
        best = q;
    return best;
  };
  const p = near('P');
  const c = near('C');
  if (!p || !c || !(p.iv > 0) || !(c.iv > 0)) return null;
  const diffPts = (p.iv - c.iv) * 100;
  return {
    putIv: p.iv,
    callIv: c.iv,
    diffPts,
    richer: Math.abs(diffPts) < 0.5 ? 'even' : diffPts > 0 ? 'puts' : 'calls',
  };
}

/** Implied move to the first expiration on or after a date, from the ATM straddle (as a fraction). */
export function impliedMoveAfter(chain: Chain, after: ISODate): { expiration: ISODate; pct: number } | null {
  const exps = [...new Set(chain.quotes.map((q) => q.expiration))].sort().filter((e) => e >= after);
  for (const e of exps) {
    const qs = chain.quotes.filter((q) => q.expiration === e);
    const c = atmQuote(qs, chain.spot, 'C');
    const p = atmQuote(qs, chain.spot, 'P');
    if (c && p && chain.spot > 0)
      return { expiration: e, pct: ((c.bid + c.ask) / 2 + (p.bid + p.ask) / 2) / chain.spot };
  }
  return null;
}

/**
 * The Ghost's base rate: over this stock's own history before today, how often did the price
 * finish a horizon of `tradingDays` beyond a move of `distPct` in the given direction?
 */
export function baseRate(
  bars: Bar[],
  distPct: number,
  tradingDays: number,
  side: 'down' | 'up',
): { rate: number; samples: number } | null {
  const n = Math.max(1, Math.round(tradingDays));
  if (bars.length < n + 20) return null;
  let hits = 0;
  let samples = 0;
  for (let i = 0; i + n < bars.length; i++) {
    const move = bars[i + n].close / bars[i].close - 1;
    samples++;
    if (side === 'down' ? move <= -distPct : move >= distPct) hits++;
  }
  return samples ? { rate: hits / samples, samples } : null;
}

export interface PortfolioRisk {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  count: number;
  sameDirection: boolean;
}

/** The Risk Officer's dashboard: net Greeks across open positions (share-equivalents per day). */
export function portfolioRisk(
  positions: Position[],
  bias: (p: Position) => 'bull' | 'bear' | 'neutral' | 'long_vol',
): PortfolioRisk {
  const g = { delta: 0, gamma: 0, theta: 0, vega: 0 };
  for (const p of positions) {
    const m = lastMark(p);
    if (!m) continue;
    g.delta += m.greeks.delta * p.qty;
    g.gamma += m.greeks.gamma * p.qty;
    g.theta += m.greeks.theta * p.qty;
    g.vega += m.greeks.vega * p.qty;
  }
  const dirs = new Set(positions.map(bias).filter((b) => b === 'bull' || b === 'bear'));
  return { ...g, count: positions.length, sameDirection: positions.length >= 2 && dirs.size === 1 };
}
