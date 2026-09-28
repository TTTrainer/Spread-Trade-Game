/**
 * Builds option quotes from a volatility surface. Used two ways:
 *  - the SIM market prices every chain this way (source 'synthetic');
 *  - real-data gaps (days the free data skipped) are filled this way with IVs interpolated
 *    from the nearest real chains (source 'modeled').
 */

import { diffDays, type ISODate } from '../calendar';
import type { Chain, OptionQuote, OptionRight, RowSource } from '../market/types';
import { bsm, forward } from './bsm';

/** Listed strike spacing for a given spot, mirroring common US equity conventions. */
export function strikeIncrement(spot: number): number {
  if (spot < 25) return 0.5;
  if (spot < 60) return 1;
  if (spot < 150) return 2.5;
  if (spot < 500) return 5;
  if (spot < 1500) return 10;
  return 25;
}

export function strikeGrid(spot: number, rangePct = 0.3): number[] {
  const inc = strikeIncrement(spot);
  const lo = Math.max(inc, Math.ceil((spot * (1 - rangePct)) / inc) * inc);
  const hi = Math.floor((spot * (1 + rangePct)) / inc) * inc;
  const out: number[] = [];
  for (let k = lo; k <= hi + 1e-9; k += inc) out.push(Math.round(k * 1000) / 1000);
  return out;
}

export interface SurfaceModel {
  /** Implied vol for a strike at an expiry, given the forward and time in years. */
  iv(expiration: ISODate, strike: number, t: number, fwd: number): number;
  /** Half of the bid/ask width in dollars for an option worth `price`. */
  halfSpread(price: number, absDelta: number): number;
}

export interface ChainBuildParams {
  symbol: string;
  date: ISODate;
  spot: number;
  rate: number;
  divYield: number;
  expirations: ISODate[];
  strikes?: (expiration: ISODate) => number[];
  model: SurfaceModel;
  source: RowSource;
  minAbsDelta?: number;
}

/** Round a theoretical price out to a tradable penny market. */
export function marketAround(theo: number, halfSpread: number): { bid: number; ask: number } {
  const bid = Math.max(0, Math.floor((theo - halfSpread) * 100 + 1e-9) / 100);
  let ask = Math.ceil((theo + halfSpread) * 100 - 1e-9) / 100;
  if (ask <= bid) ask = Math.round((bid + 0.01) * 100) / 100;
  if (ask < 0.01) ask = 0.01;
  return { bid, ask };
}

export function quoteOption(
  right: OptionRight,
  expiration: ISODate,
  strike: number,
  p: Omit<ChainBuildParams, 'expirations' | 'strikes' | 'symbol'>,
): OptionQuote {
  const t = Math.max(diffDays(p.date, expiration), 0) / 365;
  const tEff = Math.max(t, 0.5 / 365); // expiring today still has hours left at the close
  const fwd = forward(p.spot, tEff, p.rate, p.divYield);
  const iv = p.model.iv(expiration, strike, tEff, fwd);
  const g = bsm({ right, spot: p.spot, strike, t: tEff, vol: iv, rate: p.rate, divYield: p.divYield });
  const { bid, ask } = marketAround(g.price, p.model.halfSpread(g.price, Math.abs(g.delta)));
  return {
    expiration,
    strike,
    right,
    bid,
    ask,
    iv,
    delta: g.delta,
    gamma: g.gamma,
    theta: g.theta,
    vega: g.vega,
    rho: g.rho,
    source: p.source,
  };
}

export function buildChain(p: ChainBuildParams): Chain {
  const quotes: OptionQuote[] = [];
  const minDelta = p.minAbsDelta ?? 0.01;
  for (const exp of p.expirations) {
    const strikes = p.strikes ? p.strikes(exp) : strikeGrid(p.spot);
    for (const k of strikes) {
      for (const right of ['C', 'P'] as const) {
        const q = quoteOption(right, exp, k, p);
        if (Math.abs(q.delta) < minDelta && q.bid === 0) continue;
        quotes.push(q);
      }
    }
  }
  return { symbol: p.symbol, date: p.date, spot: p.spot, source: p.source, quotes };
}

/**
 * A surface interpolated from real quotes on a (log-moneyness, days-to-expiry) grid.
 * The pipeline models a missing day from the nearest real chain *before* it only. Using the
 * chain after it as well would leak the next day's IV (an earnings crush, say) into the past.
 */
export interface GridPoint {
  dte: number;
  logMoneyness: number; // ln(K / F)
  iv: number;
}

export function gridSurface(points: GridPoint[], halfSpread: SurfaceModel['halfSpread']): SurfaceModel {
  const byDte = new Map<number, GridPoint[]>();
  for (const p of points) {
    const list = byDte.get(p.dte) ?? [];
    list.push(p);
    byDte.set(p.dte, list);
  }
  const dtes = [...byDte.keys()].sort((a, b) => a - b);
  for (const d of dtes) byDte.get(d)?.sort((a, b) => a.logMoneyness - b.logMoneyness);

  const ivAtDte = (dte: number, lm: number): number => {
    const row = byDte.get(dte) ?? [];
    if (row.length === 0) return 0.3;
    if (lm <= row[0].logMoneyness) return row[0].iv;
    if (lm >= row[row.length - 1].logMoneyness) return row[row.length - 1].iv;
    for (let i = 1; i < row.length; i++) {
      if (lm <= row[i].logMoneyness) {
        const a = row[i - 1];
        const b = row[i];
        const w = (lm - a.logMoneyness) / (b.logMoneyness - a.logMoneyness || 1);
        return a.iv + w * (b.iv - a.iv);
      }
    }
    return row[row.length - 1].iv;
  };

  return {
    iv(_exp, strike, t, fwd) {
      const dte = t * 365;
      const lm = Math.log(strike / fwd);
      if (dtes.length === 0) return 0.3;
      if (dte <= dtes[0]) return ivAtDte(dtes[0], lm);
      if (dte >= dtes[dtes.length - 1]) return ivAtDte(dtes[dtes.length - 1], lm);
      for (let i = 1; i < dtes.length; i++) {
        if (dte <= dtes[i]) {
          const d0 = dtes[i - 1];
          const d1 = dtes[i];
          // Interpolate total variance, not vol, so the term structure stays arbitrage-friendly.
          const v0 = ivAtDte(d0, lm) ** 2 * d0;
          const v1 = ivAtDte(d1, lm) ** 2 * d1;
          const w = (dte - d0) / (d1 - d0);
          return Math.sqrt(Math.max(1e-6, (v0 + w * (v1 - v0)) / dte));
        }
      }
      return 0.3;
    },
    halfSpread,
  };
}
