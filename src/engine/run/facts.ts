/**
 * TradeFacts: the plain facts about one closed trade that scoring hooks may read. Built from the
 * position's own record plus the visible history of its card (never beyond the close date).
 */

import type { TradeFacts } from '../../content/types';
import { diffDays, prevTradingDay, weekday, type ISODate } from '../calendar';
import { frontDte, optionLegsOf } from '../lifecycle/position';
import type { Position } from '../lifecycle/types';
import { resolveCall } from '../scoring/calls';
import { STRUCTURES } from '../strategies/structures';
import type { OptionLeg } from '../strategies/types';
import type { TradingSession } from '../trading/session';

export interface FactsExtra {
  thetaChips: number;
  straddlesBefore: number;
  portfolioDelta: number;
}

function widthOf(legs: OptionLeg[]): number {
  const puts = legs.filter((l) => l.right === 'P').map((l) => l.strike);
  const calls = legs.filter((l) => l.right === 'C').map((l) => l.strike);
  const w = (ks: number[]) => (ks.length >= 2 ? Math.max(...ks) - Math.min(...ks) : 0);
  return Math.max(w(puts), w(calls));
}

function avgIv(p: Position, which: 'first' | 'last'): number | null {
  const m = which === 'first' ? p.marks[0] : p.marks[p.marks.length - 1];
  if (!m) return null;
  const ivs = m.legs.filter((l) => !l.stock && l.iv > 0).map((l) => l.iv);
  return ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;
}

export function computeFacts(session: TradingSession, pos: Position, extra: FactsExtra): TradeFacts {
  const def = STRUCTURES[pos.structureId];
  const card = session.card(pos.cardId);
  const view = session.view(pos.cardId);
  const closedOn = (pos.closedOn ?? view.now) as ISODate;
  const realized = pos.realizedCents ?? 0;
  const win = realized > 0;
  const firstLegs = optionLegsOf(pos.legs);
  const credit = pos.openNet < 0;
  const width = widthOf(firstLegs);
  const creditOfWidth = credit && width > 0 && def.family !== 'income' ? -pos.openNet / width : null;
  const maxProfit = pos.entry.maxProfitCents;
  const pctOfMaxProfit = maxProfit && maxProfit > 0 ? realized / maxProfit : null;
  const risk = pos.entry.maxLossCents;
  const returnOnRisk = risk > 0 ? realized / risk : null;
  const exitReason = pos.exitReason ?? 'manual';
  const expiredWorthless = def.credit && exitReason === 'expired' && (pctOfMaxProfit ?? 0) >= 0.95;

  const marks = pos.marks;
  const exitSpot = marks[marks.length - 1]?.spot ?? pos.entry.spot;
  let heldOverWeekend = false;
  for (let i = 1; i < marks.length; i++)
    if (
      weekday(marks[i].date) < weekday(marks[i - 1].date) ||
      diffDays(marks[i - 1].date, marks[i].date) >= 3
    )
      heldOverWeekend = true;
  const daysInProfit = marks.slice(1).filter((m) => m.plCents > 0).length;

  const iv0 = avgIv(pos, 'first');
  const iv1 = avgIv(pos, 'last');
  const ivChangePct = iv0 && iv1 ? iv1 / iv0 - 1 : null;

  const em = pos.entry.expectedMove;
  const moveVsEm = em && em > 0 ? Math.abs(exitSpot - pos.entry.spot) / em : null;
  const maxExcursion = marks.reduce((a, m) => Math.max(a, Math.abs(m.spot - pos.entry.spot)), 0);
  const stayedInsideEm = em && em > 0 ? maxExcursion <= em : null;

  const bias = def.bias;
  const slope = pos.entry.sma50Slope;
  const trendAligned =
    bias === 'bull'
      ? slope === null
        ? null
        : slope > 0
      : bias === 'bear'
        ? slope === null
          ? null
          : slope < 0
        : null;
  const counterTrend =
    (bias === 'bull' && slope !== null && slope < 0) || (bias === 'bear' && slope !== null && slope > 0);

  const bu = pos.entry.bollingerUpper;
  const bl = pos.entry.bollingerLower;
  const shortPuts = firstLegs.filter((l) => l.ratio < 0 && l.right === 'P').map((l) => l.strike);
  const shortCalls = firstLegs.filter((l) => l.ratio < 0 && l.right === 'C').map((l) => l.strike);
  const putOutside = shortPuts.length > 0 && bl !== null && shortPuts.every((k) => k < bl);
  const callOutside = shortCalls.length > 0 && bu !== null && shortCalls.every((k) => k > bu);
  const shortOutsideBollinger =
    (shortPuts.length === 0 || putOutside) &&
    (shortCalls.length === 0 || callOutside) &&
    shortPuts.length + shortCalls.length > 0;

  const cross = pos.entry.macdCrossDaysAgo;
  const macdCrossWithin2 =
    cross !== null &&
    cross <= 2 &&
    ((bias === 'bull' && pos.entry.macdCrossDir === 'up') ||
      (bias === 'bear' && pos.entry.macdCrossDir === 'down'));

  // The call, resolved the same way as the debrief.
  const daysHeld = Math.max(0, diffDays(pos.openedOn, closedOn));
  const call = card.call ? resolveCall(card.call, pos.entry.spot, exitSpot, daysHeld) : null;
  const callDir = card.call ? (card.call.bucket < 2 ? -1 : card.call.bucket > 2 ? 1 : 0) : 0;
  const t5 = pos.entry.trend5d;
  const against5dTrend = !!call?.exact && callDir !== 0 && t5 !== null && Math.sign(t5) === -callDir;

  // Events around the close, from the card's visible history only.
  const macro = view.macro();
  const prevDay = prevTradingDay(closedOn);
  const closedDayAfterMacro = macro.some((e) => e.date === prevDay);
  const earningsPast = view
    .earnings()
    .past.filter((e) => e.reactionDate > pos.openedOn && e.reactionDate <= closedOn);
  const eventDay =
    earningsPast.some((e) => e.reactionDate === closedOn) || macro.some((e) => e.date === closedOn);
  const ern = earningsPast[earningsPast.length - 1];
  const earningsMoveRatio =
    ern && ern.movePct !== null && ern.impliedMovePct ? Math.abs(ern.movePct) / ern.impliedMovePct : null;

  // Gaps through a short strike: the open jumped past it from the safe side.
  let gappedThroughShort = false;
  const bars = view.bars().filter((b) => b.date >= pos.openedOn && b.date <= closedOn);
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const open = bars[i].open;
    if (shortPuts.some((k) => prev > k && open < k) || shortCalls.some((k) => prev < k && open > k))
      gappedThroughShort = true;
  }

  const isStraddle = pos.structureId === 'long_straddle' || pos.structureId === 'long_strangle';
  const center = pos.structureId === 'iron_fly' ? (shortCalls[0] ?? shortPuts[0] ?? null) : null;
  const pinnedFly =
    center !== null && exitReason === 'expired' && Math.abs(exitSpot - center) / center <= 0.01;
  const condorOutsideEm =
    (pos.structureId === 'iron_condor' || pos.structureId === 'bwb_condor') &&
    em !== null &&
    shortPuts.every((k) => k < pos.entry.spot - em) &&
    shortCalls.every((k) => k > pos.entry.spot + em);

  // Calendars: front IV above back IV at entry.
  let frontIvAboveBack: boolean | null = null;
  if (def.family === 'calendar' && marks[0]) {
    const legsAt = pos.legs
      .map((l, i) => ({ l, s: marks[0].legs[i] }))
      .filter((x) => x.l.kind === 'option' && x.s && !x.s.stock) as { l: OptionLeg; s: { iv: number } }[];
    const exps = [...new Set(legsAt.map((x) => x.l.expiration))].sort();
    if (exps.length >= 2) {
      const iv = (e: string) => {
        const xs = legsAt.filter((x) => x.l.expiration === e).map((x) => x.s.iv);
        return xs.reduce((a, b) => a + b, 0) / xs.length;
      };
      frontIvAboveBack = iv(exps[0]) > iv(exps[exps.length - 1]);
    }
  }

  const stopPl = pos.brackets.stopPl;
  const lossPerUnit = -realized / (pos.qty * 100 * 100);
  const lossWithinStop =
    !win &&
    !pos.flags.stopDeclined &&
    (pos.flags.closedAtPlan === 'stop' ||
      (stopPl !== null && lossPerUnit <= stopPl * 1.02 + 1e-9 && exitReason !== 'expired'));

  const dividendsCollected = pos.events.filter((e) => e.kind === 'dividend' && (e.cashCents ?? 0) > 0).length;

  return {
    positionId: pos.id,
    cardId: pos.cardId,
    structureId: pos.structureId,
    family: def.family,
    bias,
    win,
    realizedCents: realized,
    riskPct: pos.entry.riskPct,
    shortPremium: def.credit,
    credit,
    creditOfWidth,
    pctOfMaxProfit,
    returnOnRisk,
    closedAtPlan: pos.flags.closedAtPlan,
    exitReason,
    expiredWorthless,
    dteAtEntry: pos.entry.dte,
    dteAtClose: frontDte(pos, closedOn) ?? 0,
    daysOpen: Math.max(0, marks.length - 1),
    daysInProfit,
    heldOverWeekend,
    ivrAtEntry: pos.entry.ivr,
    ivChangePct,
    ivMinusHvAtEntry: pos.entry.ivVsHv,
    heldThroughEarnings: pos.flags.earningsHeld || earningsPast.length > 0,
    moveVsEm,
    stayedInsideEm,
    rsiAtEntry: pos.entry.rsi,
    shortOutsideBollinger,
    macdCrossWithin2,
    trendAligned,
    counterTrend,
    against5dTrend,
    callExact: !!call?.exact,
    callAdjacent: !!call?.adjacent,
    callDirectionRight: !!call?.directionRight,
    callBucket: card.call?.bucket ?? null,
    callActual: call?.actual ?? null,
    callBigBucket: !!call?.exact && (card.call?.bucket === 0 || card.call?.bucket === 4),
    callFlat: card.call?.bucket === 2,
    rollsForCredit: pos.flags.rollsForCredit,
    closedDayAfterMacro,
    eventDayWin: win && eventDay,
    assigned: pos.flags.assigned,
    cspAssigned: pos.structureId === 'cash_secured_put' && pos.flags.assigned,
    coveredCallDividend: pos.structureId === 'covered_call' && pos.flags.dividendsCents > 0,
    coveredCallExpiredOtm:
      pos.structureId === 'covered_call' && exitReason === 'expired' && !pos.flags.assigned,
    pinnedFly,
    straddleBeatEm: isStraddle && moveVsEm !== null && moveVsEm > 1,
    condorOutsideEm,
    gappedThroughShort,
    earningsMoveRatio,
    highIv: pos.entry.iv > 0.6,
    portfolioDeltaAtClose: extra.portfolioDelta,
    frontIvAboveBack,
    isDoubleCalendar: pos.structureId === 'double_calendar',
    diagonalWithTrend: pos.structureId === 'diagonal' && trendAligned === true,
    thetaChips: extra.thetaChips,
    callBonus: call?.bonus ?? 0,
    stopDeclined: pos.flags.stopDeclined,
    noStop: pos.brackets.stopPl === null,
    lossWithinStop,
    dividendsCollected,
    longPremiumThroughEvent: !def.credit && (pos.flags.earningsHeld || earningsPast.length > 0),
    debitDirectional: !credit && (bias === 'bull' || bias === 'bear'),
    ivCrushWin: win && def.credit && ivChangePct !== null && ivChangePct <= -0.15,
    straddlesBefore: extra.straddlesBefore,
    isStraddle,
    shortDte: frontDte(pos, closedOn),
  };
}
