/**
 * Family bonuses (TFT-style trait counters). Owning 2, 3 or 4 cartridges of a family turns on
 * the bonus for that count. Thresholds that say "instead" replace the lower one; the rest stack.
 */

import type { ScoreStep } from '../engine/scoring/mult';
import type { Family, PassiveMods, TradeFacts } from './types';

export const FAMILY_NAMES: Record<Family, string> = {
  THETA: 'Theta',
  VEGA: 'Vega',
  DELTA: 'Delta',
  DISC: 'Discipline',
  EXEC: 'Execution',
  EVENT: 'Event',
  ECON: 'Economy',
  CHAOS: 'Chaos',
};

export const FAMILY_TEXT: Record<Family, [string, string, string]> = {
  THETA: ['+20 chips on short-premium wins', '+1 mult on short-premium wins', 'Theta chips x2'],
  VEGA: ['Live IV-change readout', 'IV-crush wins x1.25', 'IV-crush wins x1.5'],
  DELTA: [
    'Trend arrow on lineup cards',
    'Correct direction calls +1 mult',
    'Correct direction calls +2 mult',
  ],
  DISC: ['Stop refunds +10%', 'Stress from losses halved', 'Closing at plan +1 mult'],
  EXEC: ['Fills 5% closer to mid', 'Fills 10% closer to mid', 'Rolls and adjustments with no slippage'],
  EVENT: ['Implied move on lineup cards', 'Event-day wins +1 mult', 'Event-day wins x1.5'],
  ECON: ['Interest cap +$1', '+1 shop slot', 'First reroll free each shop'],
  CHAOS: ['Each CHAOS cartridge: winners +0.5 mult, losses count 15% more', '', ''],
};

export const ALL_FAMILIES: Family[] = ['THETA', 'VEGA', 'DELTA', 'DISC', 'EXEC', 'EVENT', 'ECON', 'CHAOS'];

export function emptyFamilies(): Record<Family, number> {
  return { THETA: 0, VEGA: 0, DELTA: 0, DISC: 0, EXEC: 0, EVENT: 0, ECON: 0, CHAOS: 0 };
}

const step = (label: string, op: ScoreStep['op'], value: number): ScoreStep => ({
  label,
  kind: 'family',
  op,
  value,
  tag: 'ARCADE',
});

/** Additive family steps (applied with the other + sources, before Edge Rank). */
export function familyAddSteps(f: TradeFacts, n: Record<Family, number>): ScoreStep[] {
  const out: ScoreStep[] = [];
  if (f.win && f.shortPremium) {
    if (n.THETA >= 2) out.push(step('THETA x2', 'chips', 20));
    if (n.THETA >= 3) out.push(step('THETA x3', 'add', 1));
    if (n.THETA >= 4 && f.thetaChips > 0) out.push(step('THETA x4 (theta chips x2)', 'chips', f.thetaChips));
  }
  if (f.win && f.callDirectionRight && !f.callFlat && n.DELTA >= 3)
    out.push(step(`DELTA x${Math.min(4, n.DELTA)}`, 'add', n.DELTA >= 4 ? 2 : 1));
  if (f.win && n.DISC >= 4 && f.closedAtPlan === 'target') out.push(step('DISCIPLINE x4', 'add', 1));
  if (f.win && n.EVENT >= 3 && n.EVENT < 4 && f.eventDayWin) out.push(step('EVENT x3', 'add', 1));
  if (f.win && n.CHAOS > 0) out.push(step(`CHAOS x${n.CHAOS}`, 'add', 0.5 * n.CHAOS));
  return out;
}

/** Multiplicative family steps (applied after Edge Rank, before cartridges). */
export function familyMulSteps(f: TradeFacts, n: Record<Family, number>): ScoreStep[] {
  const out: ScoreStep[] = [];
  if (f.win && f.ivCrushWin && n.VEGA >= 3)
    out.push(step(`VEGA x${Math.min(4, n.VEGA)}`, 'mul', n.VEGA >= 4 ? 1.5 : 1.25));
  if (f.win && n.EVENT >= 4 && f.eventDayWin) out.push(step('EVENT x4', 'mul', 1.5));
  if (!f.win && n.DISC >= 2 && f.closedAtPlan === 'stop')
    out.push(step('DISCIPLINE x2 (stop refund)', 'meter', 0.9));
  if (!f.win && n.CHAOS > 0) out.push(step(`CHAOS x${n.CHAOS}`, 'meter', 1 + 0.15 * n.CHAOS));
  return out;
}

/** Passive modifiers from family counts. */
export function familyPassives(
  n: Record<Family, number>,
): PassiveMods & { stressFromLossesMult?: number; shopRerollFree?: boolean } {
  const m: PassiveMods & { stressFromLossesMult?: number; shopRerollFree?: boolean } = {};
  if (n.EXEC >= 2)
    m.execution = {
      marketImprove: n.EXEC >= 3 ? 0.1 : 0.05,
      limitBoost: n.EXEC >= 3 ? 0.1 : 0.05,
      ...(n.EXEC >= 4 ? { rollSlippage: 0 } : {}),
    };
  if (n.ECON >= 2) m.interestCapAdd = 1;
  if (n.ECON >= 3) m.shopSlotsAdd = 1;
  if (n.ECON >= 4) m.freeFirstShopReroll = true;
  if (n.DISC >= 3) m.stressFromLossesMult = 0.5;
  return m;
}
