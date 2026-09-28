/**
 * Decision grade vs. outcome. A process checklist grades the trade A-F regardless of how it
 * turned out, and the outcome is labeled separately ("good trade, bad luck").
 */

import { BALANCE } from '../../content/balance';
import type { Position } from '../lifecycle/types';
import { STRUCTURES } from '../strategies/structures';
import type { Grade } from './calls';

export interface CheckItem {
  id: 'sized' | 'ivr' | 'em' | 'earnings' | 'exit' | 'edge';
  label: string;
  pass: boolean | null; // null = not applicable
  note: string;
}

export interface ProcessGrade {
  grade: Grade;
  items: CheckItem[];
  outcome: string;
  score: number;
}

export type MistakeTag =
  | 'held_past_stop'
  | 'low_ivr_premium'
  | 'short_inside_em'
  | 'unplanned_earnings'
  | 'oversized'
  | 'poor_edge'
  | 'held_last_7'
  | 'ignored_pin'
  | 'ignored_exdiv'
  | 'rolled_for_debit'
  | 'counter_trend';

export const MISTAKE_LABELS: Record<MistakeTag, string> = {
  held_past_stop: 'Held past stop',
  low_ivr_premium: 'Sold premium at low IVR',
  short_inside_em: 'Short strike inside the expected move',
  unplanned_earnings: 'Unplanned earnings exposure',
  oversized: 'Oversized',
  poor_edge: 'Poor Edge Rank',
  held_last_7: 'Held into the last 7 DTE',
  ignored_pin: 'Ignored pin risk',
  ignored_exdiv: 'Ignored ex-dividend risk',
  rolled_for_debit: 'Rolled for a debit',
  counter_trend: 'Counter-trend',
};

export interface GradeInput {
  pos: Position;
  riskCapPct: number;
  earningsAcknowledged: boolean;
  declinedDecisions: string[]; // decision kinds the player answered "hold" to
}

const isShortPremium = (pos: Position) => pos.entry.credit;

function trendAgainst(pos: Position): boolean {
  const s = pos.entry.sma50Slope ?? 0;
  if (Math.abs(s) < 0.02) return false;
  const bias = STRUCTURES[pos.structureId].bias;
  if (bias === 'bull') return s < 0;
  if (bias === 'bear') return s > 0;
  return false;
}

export function mistakeTags(i: GradeInput): MistakeTag[] {
  const { pos } = i;
  const tags: MistakeTag[] = [];
  const e = pos.entry;
  if (pos.flags.stopDeclined) tags.push('held_past_stop');
  if (isShortPremium(pos) && e.ivr !== null && e.ivr < 20) tags.push('low_ivr_premium');
  if (
    isShortPremium(pos) &&
    e.expectedMove !== null &&
    e.shortStrikes.some((k) => Math.abs(k - e.spot) < (e.expectedMove as number))
  )
    tags.push('short_inside_em');
  if (e.earningsInside && !i.earningsAcknowledged && STRUCTURES[pos.structureId].family !== 'volatility')
    tags.push('unplanned_earnings');
  if (e.riskPct > BALANCE.risk.plannedRiskPct + 1e-9) tags.push('oversized');
  if (e.edgePercentile !== null && e.edgePercentile < 0.25) tags.push('poor_edge');
  if (pos.flags.heldIntoLast7 && isShortPremium(pos)) tags.push('held_last_7');
  if (i.declinedDecisions.includes('pin_risk') && pos.flags.assigned) tags.push('ignored_pin');
  if (i.declinedDecisions.includes('exdiv_itm_call') && pos.flags.assigned) tags.push('ignored_exdiv');
  if (pos.flags.rolledForDebit) tags.push('rolled_for_debit');
  if (trendAgainst(pos)) tags.push('counter_trend');
  return tags;
}

export function processGrade(i: GradeInput): ProcessGrade {
  const { pos } = i;
  const e = pos.entry;
  const def = STRUCTURES[pos.structureId];
  const shortVega = e.credit && def.family !== 'calendar';
  const items: CheckItem[] = [
    {
      id: 'sized',
      label: 'Sized within plan',
      pass: e.riskPct <= BALANCE.risk.plannedRiskPct + 1e-9,
      note: `Risked ${(e.riskPct * 100).toFixed(1)}% of equity (plan: ${(BALANCE.risk.plannedRiskPct * 100).toFixed(0)}%).`,
    },
    {
      id: 'ivr',
      label: 'IV rank suited to the structure',
      pass:
        e.ivr === null
          ? null
          : shortVega
            ? e.ivr >= 30
            : def.family === 'volatility' || !e.credit
              ? e.ivr <= 50
              : true,
      note:
        e.ivr === null
          ? 'No IV rank history.'
          : `IV rank ${e.ivr.toFixed(0)} for a ${shortVega ? 'premium-selling' : 'premium-buying'} trade.`,
    },
    {
      id: 'em',
      label: 'Short strikes outside the expected move',
      pass:
        !e.credit || e.expectedMove === null || e.shortStrikes.length === 0
          ? null
          : e.shortStrikes.every((k) => Math.abs(k - e.spot) >= (e.expectedMove as number)),
      note:
        e.expectedMove === null
          ? 'No expected move available.'
          : `Expected move ±${e.expectedMove.toFixed(2)}.`,
    },
    {
      id: 'earnings',
      label: 'Earnings exposure intentional',
      pass: !e.earningsInside ? null : i.earningsAcknowledged || def.family === 'volatility',
      note: e.earningsInside
        ? i.earningsAcknowledged
          ? 'You held through earnings on purpose.'
          : 'Earnings fell inside the trade without a plan for it.'
        : 'No earnings inside the trade.',
    },
    {
      id: 'exit',
      label: 'Exit per plan',
      pass: pos.flags.stopDeclined
        ? false
        : pos.exitReason === 'target' ||
            pos.exitReason === 'stop' ||
            pos.flags.closedAtPlan !== null ||
            pos.exitReason === 'expired' ||
            pos.exitReason === 'manual'
          ? true
          : null,
      note: pos.flags.stopDeclined ? 'You declined your own stop.' : `Exit: ${pos.exitReason ?? 'open'}.`,
    },
    {
      id: 'edge',
      label: 'Edge Rank at or above median',
      pass: e.edgePercentile === null ? null : e.edgePercentile >= 0.5,
      note:
        e.edgePercentile === null
          ? 'No comparable spreads to rank against.'
          : `Better than ${(e.edgePercentile * 100).toFixed(0)}% of comparable spreads.`,
    },
  ];
  const applicable = items.filter((x) => x.pass !== null);
  const score = applicable.length ? applicable.filter((x) => x.pass).length / applicable.length : 1;
  const grade: Grade =
    score >= 0.9 ? 'A' : score >= 0.75 ? 'B' : score >= 0.6 ? 'C' : score >= 0.4 ? 'D' : 'F';
  const won = (pos.realizedCents ?? 0) > 0;
  const good = score >= 0.75;
  const outcome = good
    ? won
      ? 'Good trade, good result.'
      : 'Good trade, bad luck.'
    : won
      ? 'Bad trade, good luck.'
      : 'Bad trade, bad result.';
  return { grade, items, outcome, score };
}
