/**
 * Calling your shot. Five buckets whose cutoffs scale with the stock's expected move over the
 * trade's horizon, so "big" means the same thing for an index fund and a meme stock.
 */

import { BALANCE } from '../../content/balance';

export type Bucket = 0 | 1 | 2 | 3 | 4; // down big, down, flat, up, up big
export const BUCKET_GLYPHS = ['▼▼', '▼', '■', '▲', '▲▲'] as const;
export const BUCKET_NAMES = ['Down big', 'Down', 'Flat', 'Up', 'Up big'] as const;
export const CONFIDENCES = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

export interface Call {
  bucket: Bucket;
  confidence: number;
  /** Expected move to expiration at entry, as a fraction of spot (from the ATM straddle). */
  emPct: number;
  /** Calendar days from entry to the trade's front expiration. */
  horizonDays: number;
  mode: 'em' | 'fixed';
}

export interface Cutoffs {
  flat: number; // |move| up to this is flat
  big: number; // |move| beyond this is big
}

export function cutoffs(call: Pick<Call, 'emPct' | 'mode'>, elapsedFraction = 1): Cutoffs {
  if (call.mode === 'fixed') {
    const s = Math.sqrt(Math.max(elapsedFraction, 1e-6));
    return { flat: BALANCE.calls.fixedFlatPct * s, big: BALANCE.calls.fixedBigPct * s };
  }
  const em = call.emPct * Math.sqrt(Math.max(elapsedFraction, 1e-6));
  return { flat: BALANCE.calls.flatEm * em, big: BALANCE.calls.bigEm * em };
}

export function bucketOf(movePct: number, c: Cutoffs): Bucket {
  const a = Math.abs(movePct);
  if (a <= c.flat) return 2;
  if (movePct > 0) return a > c.big ? 4 : 3;
  return a > c.big ? 0 : 1;
}

export interface CallResult {
  actual: Bucket;
  movePct: number;
  exact: boolean;
  adjacent: boolean;
  directionRight: boolean;
  bonus: number;
}

/**
 * Resolve a call at the trade's exit. When a trade closes early, the expected move is scaled by
 * the square root of the time that actually passed, so the same skill is measured either way.
 */
export function resolveCall(call: Call, entrySpot: number, exitSpot: number, elapsedDays: number): CallResult {
  const frac = call.horizonDays > 0 ? Math.min(1, Math.max(1, elapsedDays) / call.horizonDays) : 1;
  const movePct = exitSpot / entrySpot - 1;
  const actual = bucketOf(movePct, cutoffs(call, frac));
  const exact = actual === call.bucket;
  const adjacent = !exact && Math.abs(actual - call.bucket) === 1;
  const dirSign = (b: Bucket) => (b < 2 ? -1 : b > 2 ? 1 : 0);
  const directionRight = dirSign(actual) === dirSign(call.bucket);
  return { actual, movePct, exact, adjacent, directionRight, bonus: callBonus(call.confidence, exact, adjacent) };
}

export function callBonus(confidence: number, exact: boolean, adjacent: boolean): number {
  const s = BALANCE.scoring;
  if (exact) return Math.max(0, (confidence - s.callExactOffset) / s.callExactScale);
  if (adjacent) return s.callAdjacent;
  return 0;
}

/** Multi-class Brier score for one call: confidence on the chosen bucket, the rest spread evenly. */
export function brier(call: Pick<Call, 'bucket' | 'confidence'>, actual: Bucket): number {
  let s = 0;
  for (let k = 0; k < 5; k++) {
    const p = k === call.bucket ? call.confidence : (1 - call.confidence) / 4;
    const o = k === actual ? 1 : 0;
    s += (p - o) ** 2;
  }
  return s;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export function calibrationGrade(meanBrier: number | null): Grade {
  if (meanBrier === null) return 'C';
  const [a, b, c, d] = BALANCE.calibration.grades;
  if (meanBrier <= a) return 'A';
  if (meanBrier <= b) return 'B';
  if (meanBrier <= c) return 'C';
  if (meanBrier <= d) return 'D';
  return 'F';
}

export function meanBrier(scores: number[]): number | null {
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

/** The % cutoffs to print on the Call cards. */
export function cutoffLabels(call: Pick<Call, 'emPct' | 'mode'>): string[] {
  const c = cutoffs(call);
  const p = (x: number) => `${(x * 100).toFixed(1)}%`;
  return [`< −${p(c.big)}`, `−${p(c.big)} to −${p(c.flat)}`, `±${p(c.flat)}`, `+${p(c.flat)} to +${p(c.big)}`, `> +${p(c.big)}`];
}
