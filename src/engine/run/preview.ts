/**
 * Score Preview: what the trade on the builder would score at max profit, through the same
 * pipeline as the real tally. It assumes the trade expires at max profit and, separately, what an
 * exact call would add, so the player sees both halves of the Balatro formula before placing.
 */

import type { TradeFacts } from '../../content/types';
import { runScore, type ScoreStep } from '../scoring/mult';
import { callBonus, type Call } from '../scoring/calls';
import { STRUCTURES } from '../strategies/structures';
import type { StructureId } from '../strategies/types';
import type { TradePlan } from '../trading/plan';
import type { RunEngine } from './engine';
import { scoreSteps } from './score';

export interface ScorePreview {
  chips: number;
  mult: number;
  points: number;
  steps: ScoreStep[];
  callExtra: number; // mult an exact call would add at the current confidence
  pointsIfExact: number;
  targetLeft: number;
}

export function previewFacts(
  plan: TradePlan,
  structureId: StructureId,
  cardId: string,
  realizedCents: number,
): TradeFacts {
  const def = STRUCTURES[structureId];
  const e = plan.entry;
  const credit = (plan.mid ?? 0) < 0;
  const slope = e?.sma50Slope ?? null;
  const trendAligned =
    def.bias === 'bull'
      ? slope === null
        ? null
        : slope > 0
      : def.bias === 'bear'
        ? slope === null
          ? null
          : slope < 0
        : null;
  return {
    positionId: 'preview',
    cardId,
    structureId,
    family: def.family,
    bias: def.bias,
    win: realizedCents > 0,
    realizedCents,
    riskPct: plan.riskPct,
    shortPremium: def.credit,
    credit,
    creditOfWidth:
      credit && plan.metrics && plan.metrics.width > 0 && def.family !== 'income'
        ? -(plan.mid ?? 0) / plan.metrics.width
        : null,
    pctOfMaxProfit: 1,
    returnOnRisk: null,
    closedAtPlan: null,
    exitReason: 'expired',
    expiredWorthless: def.credit,
    dteAtEntry: plan.dte ?? 0,
    dteAtClose: 0,
    daysOpen: plan.dte ?? 0,
    daysInProfit: 0,
    heldOverWeekend: (plan.dte ?? 0) >= 3,
    ivrAtEntry: e?.ivr ?? null,
    ivChangePct: null,
    ivMinusHvAtEntry: e?.ivVsHv ?? null,
    heldThroughEarnings: !!e?.earningsInside,
    moveVsEm: null,
    stayedInsideEm: null,
    rsiAtEntry: e?.rsi ?? null,
    shortOutsideBollinger: false,
    macdCrossWithin2: false,
    trendAligned,
    counterTrend: trendAligned === false,
    against5dTrend: false,
    callExact: false,
    callAdjacent: false,
    callDirectionRight: false,
    callBucket: null,
    callActual: null,
    callBigBucket: false,
    callFlat: false,
    rollsForCredit: 0,
    closedDayAfterMacro: false,
    eventDayWin: false,
    assigned: false,
    cspAssigned: false,
    coveredCallDividend: false,
    coveredCallExpiredOtm: structureId === 'covered_call',
    pinnedFly: false,
    straddleBeatEm: false,
    condorOutsideEm: false,
    gappedThroughShort: false,
    earningsMoveRatio: null,
    highIv: (e?.iv ?? 0) > 0.6,
    portfolioDeltaAtClose: 0,
    frontIvAboveBack: null,
    isDoubleCalendar: structureId === 'double_calendar',
    diagonalWithTrend: structureId === 'diagonal' && trendAligned === true,
    thetaChips: 0,
    callBonus: 0,
    stopDeclined: false,
    noStop: false,
    lossWithinStop: false,
    dividendsCollected: 0,
    longPremiumThroughEvent: !def.credit && !!e?.earningsInside,
    debitDirectional: !credit && (def.bias === 'bull' || def.bias === 'bear'),
    ivCrushWin: false,
    straddlesBefore: 0,
    isStraddle: structureId === 'long_straddle' || structureId === 'long_strangle',
    shortDte: 0,
  };
}

export function previewScore(
  engine: RunEngine,
  plan: TradePlan,
  structureId: StructureId,
  cardId: string,
  call: Call | null,
): ScorePreview | null {
  if (!plan.ok || !plan.entry) return null;
  const st = engine.state;
  const r = st.round;
  const maxProfit = plan.maxProfitCents ?? plan.riskCents;
  if (!maxProfit || maxProfit <= 0) return null;
  const facts = previewFacts(plan, structureId, cardId, maxProfit);
  const input = {
    facts,
    deskId: st.config.deskId,
    level: st.levels[structureId] ?? 1,
    goodRR: plan.goodRR,
    edgeTier: plan.edge?.tier ?? null,
    reviewId: r.reviewId,
    bossId: r.bossId,
    showdown: r.showdown ?? 0,
    families: engine.families(),
    cartridges: engine.activeCartridges(),
    // Previews never mutate cartridge state.
    cartState: JSON.parse(JSON.stringify(st.cartState)) as typeof st.cartState,
    run: engine.runView(),
    doubleDown: r.memo.doubleDown,
    hedge: false,
  };
  const steps = scoreSteps(input);
  const res = runScore(maxProfit, r.startEquityCents, steps);
  const extra = call ? callBonus(call.confidence, true, false) : callBonus(0.7, true, false);
  const exactFacts = {
    ...facts,
    callExact: true,
    callDirectionRight: true,
    callBonus: extra,
    callBucket: call?.bucket ?? null,
    callFlat: call?.bucket === 2,
    callBigBucket: call?.bucket === 0 || call?.bucket === 4,
  };
  const exact = runScore(
    maxProfit,
    r.startEquityCents,
    scoreSteps({
      ...input,
      facts: exactFacts,
      cartState: JSON.parse(JSON.stringify(st.cartState)) as typeof st.cartState,
    }),
  );
  return {
    chips: res.chips,
    mult: res.mult,
    points: res.points,
    steps,
    callExtra: extra,
    pointsIfExact: exact.points,
    targetLeft: Math.max(0, r.target - r.meter),
  };
}
