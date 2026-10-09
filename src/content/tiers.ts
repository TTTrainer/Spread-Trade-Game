/** Risk Tiers (ascension, cumulative like Balatro's stakes). Beating a tier unlocks the next. */

import { BALANCE } from './balance';

/**
 * Every tier above 0 also raises targets by this much (on top of Tier 5's own +25%), so a strong
 * player who finds the base game easy can climb into the pressure they want.
 */
export const TIER_TARGET_STEP = 0.1;

export const RISK_TIERS: { tier: number; name: string; text: string }[] = [
  { tier: 0, name: 'Tier 0', text: 'Base rules.' },
  { tier: 1, name: 'Tier 1', text: 'Fees on ($0.65 per contract per leg). Targets +10%.' },
  { tier: 2, name: 'Tier 2', text: 'Max-Loss Line 2% tighter. Targets +10%.' },
  { tier: 3, name: 'Tier 3', text: 'Risk cap 7.5% of equity. Targets +10%.' },
  { tier: 4, name: 'Tier 4', text: 'Early assignment always on. Targets +10%.' },
  { tier: 5, name: 'Tier 5', text: 'Targets +25%, and +10%.' },
  { tier: 6, name: 'Tier 6', text: '-1 reroll per round. Targets +10%.' },
  { tier: 7, name: 'Tier 7', text: 'Fills one step worse. Targets +10%.' },
  { tier: 8, name: 'Tier 8', text: '-1 ticket per round. Targets +10%.' },
];

export interface TierMods {
  fees: boolean;
  lineDelta: number;
  riskCapPct: number;
  assignmentAlways: boolean;
  targetMult: number;
  rerollDelta: number;
  fillPenalty: number;
  ticketDelta: number;
}

export function tierMods(t: number): TierMods {
  return {
    fees: t >= 1,
    lineDelta: t >= 2 ? -0.02 : 0,
    riskCapPct: t >= 3 ? 0.075 : BALANCE.risk.riskCapPct,
    assignmentAlways: t >= 4,
    targetMult: (t >= 5 ? 1.25 : 1) * (1 + TIER_TARGET_STEP * Math.max(0, t)),
    rerollDelta: t >= 6 ? -1 : 0,
    fillPenalty: t >= 7 ? BALANCE.fills.tier7Penalty : 0,
    ticketDelta: t >= 8 ? -1 : 0,
  };
}
