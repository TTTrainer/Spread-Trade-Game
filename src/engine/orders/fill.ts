/**
 * The fill model. Prices are "net cost" per share per unit in the direction being traded:
 * positive = you pay, negative = you receive. Natural is the worst price (buy at the ask,
 * sell at the bid); it always fills. Limits between mid and natural fill with a probability
 * that rises from ~35% at mid to 100% at natural, resolved with the seeded RNG. Execution
 * perks only ever move fills toward mid: never outside the real bid/ask.
 */

import type { Rng } from '../rng';

export interface ComboQuote {
  mid: number;
  natural: number;
}

export interface ExecutionMods {
  /** Fraction of the half-spread saved on market orders (Smart Router, DMA, EXECUTION set). */
  marketImprove: number;
  /** Fraction of the half-spread a limit is treated as more aggressive by (Level II Feed...). */
  limitBoost: number;
  /** Probability penalty per fill (Risk Tier 7: fills one step worse). */
  fillPenalty: number;
  /** Extra slippage on rolls and adjustments, as a fraction of the half-spread. */
  rollSlippage: number;
  marketOrdersDisabled: boolean;
}

export const BASE_EXECUTION: ExecutionMods = {
  marketImprove: 0,
  limitBoost: 0,
  fillPenalty: 0,
  rollSlippage: 0.1,
  marketOrdersDisabled: false,
};

export const FILL_P_AT_MID = 0.35;

export type OrderType = 'market' | 'limit';

export interface FillAttempt {
  type: OrderType;
  limit?: number;
  isRoll?: boolean;
  /** Roll Voucher memo: this roll fills at mid. */
  atMid?: boolean;
}

export interface FillResult {
  filled: boolean;
  price: number;
  probability: number;
  reason?: string;
}

/** Fill probability for a limit, before the dice roll. */
export function limitFillProbability(
  q: ComboQuote,
  limit: number,
  mods: ExecutionMods = BASE_EXECUTION,
  pMid = FILL_P_AT_MID,
): number {
  const half = q.natural - q.mid; // >= 0 for a cost convention
  if (half <= 1e-12) return limit >= q.natural - 1e-9 ? 1 : 0;
  const eff = limit + mods.limitBoost * half;
  let p: number;
  if (eff >= q.natural - 1e-9) p = 1;
  else if (eff >= q.mid) p = pMid + (1 - pMid) * ((eff - q.mid) / half);
  else p = pMid * Math.max(0, 1 - (q.mid - eff) / half);
  return Math.max(0, Math.min(1, p - mods.fillPenalty));
}

export function marketPrice(q: ComboQuote, mods: ExecutionMods = BASE_EXECUTION, isRoll = false): number {
  const half = q.natural - q.mid;
  const improve = Math.max(0, Math.min(1, mods.marketImprove));
  const extra = isRoll ? Math.max(0, mods.rollSlippage) : 0;
  // Roll slippage can never push past natural: fills stay inside the real bid/ask.
  return Math.min(q.natural, q.mid + half * (1 - improve) + half * extra);
}

export function attemptFill(
  q: ComboQuote,
  a: FillAttempt,
  rng: Rng,
  mods: ExecutionMods = BASE_EXECUTION,
): FillResult {
  if (a.atMid) return { filled: true, price: q.mid, probability: 1 };
  if (a.type === 'market') {
    if (mods.marketOrdersDisabled)
      return {
        filled: false,
        price: q.natural,
        probability: 0,
        reason: 'Market orders are disabled this round.',
      };
    return { filled: true, price: marketPrice(q, mods, a.isRoll), probability: 1 };
  }
  const limit = a.limit ?? q.mid;
  if (limit >= q.natural - 1e-9)
    return { filled: true, price: marketPrice(q, mods, a.isRoll), probability: 1 };
  const p = limitFillProbability(q, limit, mods);
  const roll = rng.next();
  return { filled: roll < p, price: limit, probability: p };
}

/** A resting limit fills at a later close only if that close's natural price crosses it. */
export function restingFill(q: ComboQuote, limit: number): FillResult {
  if (q.natural <= limit + 1e-9) return { filled: true, price: limit, probability: 1 };
  return { filled: false, price: limit, probability: 0 };
}

/** Combine several "x% closer to mid" sources without ever exceeding 100%. */
export function combineImprove(parts: number[]): number {
  return 1 - parts.reduce((acc, p) => acc * (1 - Math.max(0, Math.min(1, p))), 1);
}
