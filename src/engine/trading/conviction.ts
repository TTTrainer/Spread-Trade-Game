/**
 * Conviction: one dial for how sure you are and how much you bet on it.
 *
 * The call a trade makes is read from the trade itself (a bull put says "up", a condor says
 * "flat"), and the confidence behind it is how much of the per-trade risk cap you commit. Being
 * right at high conviction scores more; being wrong at high conviction costs more, and calibration
 * grades whether your conviction matches how often you are right.
 */

import { BALANCE } from '../../content/balance';
import type { Bucket } from '../scoring/calls';
import { STRUCTURES } from '../strategies/structures';
import type { Leg, OptionLeg, StructureId } from '../strategies/types';

/**
 * The five conviction steps: the confidence recorded for the call, and the share of the risk cap
 * used (read from BALANCE.conviction, so the balance simulator can tune it).
 */
const STEPS = [
  { confidence: 0.5, label: 'FEELER' },
  { confidence: 0.6, label: 'LEAN' },
  { confidence: 0.7, label: 'SOLID' },
  { confidence: 0.8, label: 'STRONG' },
  { confidence: 0.9, label: 'ALL IN' },
] as const;

export interface ConvictionStep {
  confidence: (typeof STEPS)[number]['confidence'];
  label: (typeof STEPS)[number]['label'];
  readonly capShare: number;
}

export const CONVICTION: readonly ConvictionStep[] = STEPS.map((s, i) => ({
  ...s,
  get capShare() {
    return BALANCE.conviction.capShares[i];
  },
}));

export function convictionStep(confidence: number): ConvictionStep {
  return CONVICTION.reduce((best, c) =>
    Math.abs(c.confidence - confidence) < Math.abs(best.confidence - confidence) ? c : best,
  );
}

/**
 * Contracts for a conviction: as many as fit inside that share of the risk cap, never fewer than
 * one (the plan still refuses a single contract that breaks the cap itself).
 */
export function convictionQty(
  perContractMaxLossCents: number,
  equityCents: number,
  riskCapPct: number,
  confidence: number,
  maxQty = 50,
): number {
  if (perContractMaxLossCents <= 0) return 1;
  const budget = equityCents * riskCapPct * convictionStep(confidence).capShare;
  return Math.max(1, Math.min(maxQty, Math.floor(budget / perContractMaxLossCents)));
}

/**
 * The call a trade makes. Bullish structures call "up", or "up big" when they only pay after a
 * large rise (a short put above the price, a long call bought well out of the money); bearish ones
 * mirror that; neutral ones call "flat". Long volatility has no direction, so it takes the side
 * the player picks (up big unless flipped).
 */
export function impliedBucket(
  structureId: StructureId,
  legs: Leg[],
  spot: number,
  emPct: number,
  flipVol = false,
): Bucket {
  const s = STRUCTURES[structureId];
  const opts = legs.filter((l): l is OptionLeg => l.kind === 'option');
  const far = Math.max(0.01, emPct) * 0.5;
  if (s.bias === 'neutral') return 2;
  if (s.bias === 'long_vol') return flipVol ? 0 : 4;
  const bull = s.bias === 'bull';
  // The leg that decides the trade: the sold one for credits, the bought one for debits.
  const key = s.credit ? opts.find((l) => l.ratio < 0) : opts.find((l) => l.ratio > 0);
  if (!key || spot <= 0) return bull ? 3 : 1;
  const rel = key.strike / spot - 1;
  if (bull) return (s.credit ? rel >= 0 : rel > far) ? 4 : 3;
  return (s.credit ? rel <= 0 : rel < -far) ? 0 : 1;
}
