/**
 * Account rules: fees, pattern day trading, buying power and the per-trade risk cap.
 */

import { type ISODate } from '../calendar';
import type { Cents } from '../money';
import type { Leg } from '../strategies/types';

export const FEE_PER_CONTRACT_CENTS = 65;

/** $0.65 per contract per option leg to open or close; nothing on expiration or for stock. */
export function feesFor(legs: Leg[], units: number, enabled: boolean): Cents {
  if (!enabled) return 0;
  const contracts = legs.filter((l) => l.kind === 'option').reduce((a, l) => a + Math.abs(l.ratio), 0);
  return FEE_PER_CONTRACT_CENTS * contracts * units;
}

export const PDT_EQUITY_CENTS = 2_500_000;
export const PDT_MAX_DAY_TRADES = 3;
export const PDT_WINDOW_DAYS = 5;

/**
 * Pattern day trader rule: under $25k, at most 3 day trades (open and close the same day)
 * in any rolling 5 trading days. `recentDayTrades` are the dates of past day trades.
 */
export function pdtAllows(opts: { enabled: boolean; equityCents: Cents; recentDayTrades: ISODate[]; tradingDaysBack: ISODate[] }): boolean {
  if (!opts.enabled || opts.equityCents >= PDT_EQUITY_CENTS) return true;
  const window = new Set(opts.tradingDaysBack.slice(-PDT_WINDOW_DAYS));
  const used = opts.recentDayTrades.filter((d) => window.has(d)).length;
  return used < PDT_MAX_DAY_TRADES;
}

export interface RiskCheckInput {
  maxLossCents: Cents;
  collateralCents: Cents;
  equityCents: Cents;
  riskCapPct: number; // e.g. 0.10
  reservedCents: Cents; // collateral already held by open positions
}

export type RiskCheck = { ok: true; riskPct: number } | { ok: false; reason: string; riskPct: number };

/** Defined-risk only: max loss must fit the risk cap and collateral must fit free equity. */
export function checkRisk(i: RiskCheckInput): RiskCheck {
  const riskPct = i.equityCents > 0 ? i.maxLossCents / i.equityCents : Infinity;
  if (!Number.isFinite(i.maxLossCents) || i.maxLossCents <= 0) return { ok: false, reason: 'This build has no defined maximum loss.', riskPct };
  const cap = Math.floor(i.equityCents * i.riskCapPct);
  if (i.maxLossCents > cap) {
    return { ok: false, reason: `Max loss is ${(riskPct * 100).toFixed(1)}% of equity; the cap is ${(i.riskCapPct * 100).toFixed(1)}%. Use fewer contracts or a narrower width.`, riskPct };
  }
  const free = i.equityCents - i.reservedCents;
  if (i.collateralCents > free) return { ok: false, reason: 'Not enough free buying power for the collateral this trade needs.', riskPct };
  return { ok: true, riskPct };
}
