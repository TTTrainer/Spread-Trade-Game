/**
 * The scoring pipeline for one closed trade, Balatro-style: additive sources first (structure
 * level, R:R, call bonus, discipline, desk passive, family bonuses), then Edge Rank multiplies,
 * then multiplicative family bonuses, the Review's rule, and finally each cartridge in slot order.
 * Memos and meter effects come last. Losers keep only meter effects: they are never multiplied.
 */

import { BALANCE } from '../../content/balance';
import { CARTRIDGE_BY_ID } from '../../content/cartridges';
import { DESKS } from '../../content/desks';
import { familyAddSteps, familyMulSteps } from '../../content/families';
import { BOSSES, type BossId } from '../../content/bosses';
import { REVIEWS } from '../../content/reviews';
import type { CartState, DeskId, Family, ReviewId, RunView, TradeFacts } from '../../content/types';
import { roundRule } from './rules';
import { edgeStep, levelSteps, type ScoreStep } from '../scoring/mult';
import { STRUCTURES } from '../strategies/structures';

export interface PipelineInput {
  facts: TradeFacts;
  deskId: DeskId;
  level: number;
  goodRR: boolean;
  edgeTier: 'top10' | 'top25' | 'none' | null;
  reviewId: ReviewId | null;
  /** This round's boss (its one twist replaces the market type's old Review rule). */
  bossId?: BossId | null;
  /** Losing trades in a row closed just before this one, this round. */
  lossStreak?: number;
  families: Record<Family, number>;
  cartridges: string[];
  cartState: Record<string, CartState>;
  run: RunView;
  doubleDown: boolean;
  hedge: boolean;
}

export function scoreSteps(i: PipelineInput): ScoreStep[] {
  const f = i.facts;
  const s = BALANCE.scoring;
  const rule = roundRule(i.reviewId, i.bossId);
  const boss = i.bossId ? BOSSES[i.bossId].name : '';
  const steps: ScoreStep[] = [];

  // 1. Additive sources.
  const base = STRUCTURES[f.structureId].baseChips * (rule.baseChipsMult ?? 1);
  const lv = levelSteps(i.level, base);
  if (rule.baseChipsMult !== undefined)
    lv[0] = {
      ...lv[0],
      label: `Structure base (${REVIEWS[i.reviewId as ReviewId].name} x${rule.baseChipsMult})`,
      kind: 'review',
    };
  steps.push(...lv);
  if (i.goodRR) steps.push({ label: 'Good R:R', kind: 'rr', op: 'add', value: s.rrMult });
  if (f.callBonus > 0) {
    const m = rule.callBonusMult ?? 1;
    steps.push({
      label: f.callExact ? `Call exact${m !== 1 ? ` (x${m})` : ''}` : 'Call one bucket off',
      kind: 'call',
      op: 'add',
      value: f.callBonus * m,
    });
  }
  if (f.closedAtPlan === 'target')
    steps.push({ label: 'Closed at plan', kind: 'discipline', op: 'add', value: s.disciplineMult });
  steps.push(...(DESKS[i.deskId].passive?.(f) ?? []));
  steps.push(...familyAddSteps(f, i.families));

  // 2. Edge Rank multiplies.
  const edge = edgeStep(i.edgeTier, i.cartridges.includes('edge_hunter') ? 2 : s.edgeTop10);
  if (edge)
    steps.push(
      i.cartridges.includes('edge_hunter') && i.edgeTier === 'top10'
        ? { ...edge, label: 'Edge Rank top 10% (Edge Hunter)' }
        : edge,
    );

  // 3. Multiplicative family bonuses and the Review's rule.
  steps.push(...familyMulSteps(f, i.families));
  if (rule.debitDirectionalWinMult !== undefined && f.win && f.debitDirectional)
    steps.push({
      label: 'The Chop: debit directional',
      kind: 'review',
      op: 'mul',
      value: rule.debitDirectionalWinMult,
    });
  if (!f.win && (f.noStop || f.stopDeclined))
    steps.push({
      label: f.stopDeclined ? 'Stop declined' : 'No stop',
      kind: 'discipline',
      op: 'meter',
      value: s.undisciplinedLossMult,
    });
  if (rule.counterTrendLossMult !== undefined && !f.win && f.counterTrend)
    steps.push({
      label: 'Trend Train: counter-trend loss',
      kind: 'review',
      op: 'meter',
      value: rule.counterTrendLossMult,
    });
  // A boss's one twist.
  if (rule.lossMult !== undefined && !f.win)
    steps.push({
      label: `${boss}: loss x${rule.lossMult}`,
      kind: 'review',
      op: 'meter',
      value: rule.lossMult,
    });
  if (rule.lossStreakStep !== undefined && !f.win && (i.lossStreak ?? 0) > 0) {
    const value = rule.lossStreakStep ** (i.lossStreak ?? 0);
    steps.push({
      label: `${boss}: ${(i.lossStreak ?? 0) + 1} losses in a row`,
      kind: 'review',
      op: 'meter',
      value: Math.round(value * 1000) / 1000,
    });
  }
  if (rule.shortWinTax && f.win && f.daysOpen <= rule.shortWinTax.days)
    steps.push({
      label: `${boss}: closed in ${f.daysOpen} day${f.daysOpen === 1 ? '' : 's'}`,
      kind: 'review',
      op: 'meter',
      value: rule.shortWinTax.mult,
    });

  // 4. Cartridges in slot order.
  for (const id of i.cartridges) {
    const c = CARTRIDGE_BY_ID[id];
    if (!c?.score) continue;
    steps.push(
      ...c.score({ facts: f, run: i.run, state: i.cartState[id] ?? {} }).map((s) => ({ ...s, source: id })),
    );
  }

  // The Landlord's cut comes off the finished mult, after every cartridge.
  if (rule.multKeep !== undefined && f.win)
    steps.push({
      label: `${boss}: the house keeps ${Math.round((1 - rule.multKeep) * 100)}%`,
      kind: 'review',
      op: 'mul',
      value: rule.multKeep,
    });

  // 5. Memos.
  if (i.doubleDown) steps.push({ label: 'Double Down memo', kind: 'memo', op: 'meter', value: 2 });
  if (i.hedge && !f.win) steps.push({ label: 'Hedge memo', kind: 'memo', op: 'meter', value: 0.5 });
  return steps;
}
