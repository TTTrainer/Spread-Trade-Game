/**
 * Chips x mult, Balatro-style. Additive sources first, then Edge Rank multiplies, then each
 * cartridge applies its effect in slot order from left to right, so order matters.
 * Losers score negative chips that are never multiplied (cartridges may soften them on the
 * meter only; the ledger never changes).
 */

import { BALANCE } from '../../content/balance';
import type { Cents } from '../money';

export type ScoreSourceKind =
  | 'pnl'
  | 'base'
  | 'level'
  | 'rr'
  | 'edge'
  | 'call'
  | 'discipline'
  | 'desk'
  | 'cartridge'
  | 'family'
  | 'memo'
  | 'review'
  | 'analyst'
  | 'client';

export interface ScoreStep {
  label: string;
  kind: ScoreSourceKind;
  /** chips: add chips; add: add to mult; mul: multiply mult; chipsMul: multiply chips; meter: multiply the final meter delta. */
  op: 'chips' | 'add' | 'mul' | 'chipsMul' | 'meter';
  value: number;
  tag?: 'REAL' | 'ARCADE';
  /** Which cartridge produced it (for trigger counts). */
  source?: string;
}

export interface TraceRow {
  label: string;
  op: ScoreStep['op'];
  value: number;
  chips: number;
  mult: number;
}

export interface ScoreResult {
  winner: boolean;
  chips: number;
  mult: number;
  points: number; // what the meter moves by
  trace: TraceRow[];
}

/**
 * How much of its bonus chips a win keeps: all of them once it earned BONUS_FULL_ROR of what it
 * risked (a credit spread closed at its 50% target is about 0.2), less for a scrape. Measured on
 * risk, not account size, so a careful small trade scores as well as a big one.
 */
export function winQuality(returnOnRisk: number | null, family?: string): number {
  if (returnOnRisk === null) return 1;
  // Covered calls and cash-secured puts risk the stock itself, so a good one earns a far smaller
  // share of its risk than a spread does.
  const full = family === 'income' ? BALANCE.scoring.incomeFullRoR : BALANCE.scoring.bonusFullRoR;
  return Math.max(0, Math.min(1, returnOnRisk / full));
}

export function pnlChips(realizedCents: Cents, roundStartEquityCents: Cents): number {
  if (roundStartEquityCents <= 0) return 0;
  return (realizedCents / roundStartEquityCents) * BALANCE.scoring.chipsPerUnit;
}

/**
 * Run the pipeline. `steps` must already be in order: base additive sources, then Edge Rank,
 * then cartridges in slot order (the caller builds the list).
 */
export function runScore(
  realizedCents: Cents,
  roundStartEquityCents: Cents,
  steps: ScoreStep[],
  /** The win's quality (winQuality): scales its bonus chips. */
  quality = 1,
): ScoreResult {
  const winner = realizedCents > 0;
  const pnl = pnlChips(realizedCents, roundStartEquityCents);
  const base = pnl * (winner ? 1 : BALANCE.scoring.lossChipsScale);
  const trace: TraceRow[] = [{ label: 'P/L', op: 'chips', value: base, chips: base, mult: 1 }];
  // Bonus chips grow with the win's quality: a scrape that earned little of what it risked can't
  // farm the same bonuses as a real win.
  const size = winner ? Math.max(0, Math.min(1, quality)) : 1;
  let chips = base;
  let mult = 1;
  let meter = 1;
  for (const s of steps) {
    if (!winner && s.op !== 'meter') continue; // losers: chips are never multiplied or padded
    const value = s.op === 'chips' ? s.value * size : s.value;
    if (s.op === 'chips') chips += value;
    else if (s.op === 'chipsMul') chips *= value;
    else if (s.op === 'add') mult += value;
    else if (s.op === 'mul') mult *= value;
    else meter *= value;
    const label = s.op === 'chips' && size < 1 ? `${s.label} (thin win ×${size.toFixed(2)})` : s.label;
    trace.push({ label, op: s.op, value, chips, mult });
  }
  const points = winner ? chips * mult * meter : chips * meter;
  return { winner, chips, mult: winner ? mult : 1, points: Math.round(points), trace };
}

export function levelSteps(level: number, baseChips: number): ScoreStep[] {
  const s = BALANCE.scoring;
  const steps: ScoreStep[] = [{ label: 'Structure base', kind: 'base', op: 'chips', value: baseChips }];
  if (level > 1) {
    steps.push({
      label: `Level ${level} chips`,
      kind: 'level',
      op: 'chips',
      value: (level - 1) * s.levelChips,
    });
    steps.push({ label: `Level ${level}`, kind: 'level', op: 'add', value: (level - 1) * s.levelMult });
  }
  return steps;
}

export function edgeStep(
  tier: 'top10' | 'top25' | 'none' | null,
  top10: number = BALANCE.scoring.edgeTop10,
): ScoreStep | null {
  if (tier === 'top10') return { label: 'Edge Rank top 10%', kind: 'edge', op: 'mul', value: top10 };
  if (tier === 'top25')
    return { label: 'Edge Rank top 25%', kind: 'edge', op: 'mul', value: BALANCE.scoring.edgeTop25 };
  return null;
}
