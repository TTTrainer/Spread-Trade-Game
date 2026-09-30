/**
 * One trading day for one position, in two halves:
 *  1. at the close: dividends, the mark, brackets and decision points (the fast-forward pauses);
 *  2. after the player answers: early assignment and expiration settle at the close.
 */

import { diffDays } from '../calendar';
import type { Rng } from '../rng';
import { contractCents, type Cents } from '../money';
import { feesFor } from '../orders/rules';
import {
  addEvent,
  closePosition,
  closeQuote,
  convertLegToStock,
  frontDte,
  intrinsic,
  lastMark,
  markPosition,
  optionLegsOf,
  plIfClosedAt,
  removeLeg,
  settleLegAtIntrinsic,
  stockRatio,
  applyDividend,
} from './position';
import type { DayBook, DecisionKind, DecisionPoint, Position } from './types';

export interface RealismToggles {
  bidAsk: boolean;
  earnings: boolean;
  earlyAssignment: boolean;
  expirationMechanics: boolean;
  pdt: boolean;
  fees: boolean;
  /** Cap contracts per order and refuse legs whose market is too wide to trade. */
  liquidityLimits?: boolean;
  /** Career: set aside short-term capital-gains tax on each round's net gain. */
  taxes?: boolean;
  /** Spreads need a Level 3 margin account ($2,000 minimum equity). */
  approvalLevels?: boolean;
}

export const DEFAULT_REALISM: RealismToggles = {
  bidAsk: true,
  earnings: true,
  earlyAssignment: true,
  expirationMechanics: true,
  pdt: true,
  fees: false,
};

export interface DayContext {
  realism: RealismToggles;
  /** Which decision points pause the fast-forward. */
  pause: Record<DecisionKind, boolean>;
  /** Brackets execute without asking (Algo Execution voucher). */
  autoBrackets: boolean;
  /** Gap Risk review: no decision points on gap days. */
  suppressOnGap: boolean;
  rng: Rng;
}

export const ALL_DECISIONS: DecisionKind[] = [
  'target_hit',
  'stop_hit',
  'short_touched',
  'dte21',
  'earnings_tomorrow',
  'exdiv_itm_call',
  'pin_risk',
  'assigned_shares',
];

export function defaultPause(): Record<DecisionKind, boolean> {
  return Object.fromEntries(ALL_DECISIONS.map((k) => [k, true])) as Record<DecisionKind, boolean>;
}

export interface CloseStepResult {
  pos: Position;
  decisions: DecisionPoint[];
  /** Brackets that executed on their own (auto brackets or pause switched off). */
  autoClosed: boolean;
}

// Deterministic ids (one decision of each kind per position per day) so a replayed action log matches.
const dpId = (pos: Position, kind: DecisionKind, date: string) => `${pos.id}:${kind}:${date}`;

/** Part 1: the close. */
export function atClose(input: Position, book: DayBook, ctx: DayContext): CloseStepResult {
  let pos = input;
  if (pos.status !== 'open') return { pos, decisions: [], autoClosed: false };
  if (book.exDivToday) pos = applyDividend(pos, book.exDivToday.amount, book.date);
  pos = markPosition(pos, book);
  const mark = lastMark(pos);
  const decisions: DecisionPoint[] = [];
  const suppressed = ctx.suppressOnGap && book.gapDay;
  const want = (k: DecisionKind) => ctx.pause[k] && !suppressed;
  const dte = frontDte(pos, book.date);
  if (dte !== null && dte <= 7 && (mark?.plCents ?? 0) > 0)
    pos = { ...pos, flags: { ...pos.flags, heldIntoLast7: true } };

  // After an assignment, the shares wait for a decision at the next session.
  if (pos.flags.assignedPending) {
    pos = { ...pos, flags: { ...pos.flags, assignedPending: false } };
    if (stockRatio(pos.legs) !== 0) {
      decisions.push({
        id: dpId(pos, 'assigned_shares', book.date),
        positionId: pos.id,
        kind: 'assigned_shares',
        date: book.date,
        title: 'Shares assigned',
        message: `You hold ${Math.abs(stockRatio(pos.legs) * 100 * pos.qty)} shares ${stockRatio(pos.legs) > 0 ? 'long' : 'short'} from an assignment. Sell at the open, or keep them.`,
        options: ['sell_shares', 'hold', 'adjust'],
        planned: 'sell_shares',
      });
    }
  }

  // Brackets. Targets use the natural price you could actually get; stops trigger on the mark.
  const q = closeQuote(pos.legs, book, pos.lastLegs);
  const b = pos.brackets;
  if (
    b.targetPl !== null &&
    optionLegsOf(pos.legs).length > 0 &&
    plIfClosedAt(pos, q.natural) >= b.targetPl - 1e-9
  ) {
    const limitCost = plIfClosedAt(pos, 0) - b.targetPl;
    const fill = Math.min(limitCost, q.natural); // a gap through the limit fills at the better natural
    if (ctx.autoBrackets || !ctx.pause.target_hit) {
      const ex = contractCents(q.mid - fill, pos.qty);
      pos = closePosition(
        pos,
        fill,
        book.date,
        'target',
        feesFor(pos.legs, pos.qty, ctx.realism.fees),
        'Profit target filled',
      );
      pos = {
        ...pos,
        executionCents: pos.executionCents + ex,
        flags: { ...pos.flags, closedAtPlan: 'target' },
      };
      return { pos, decisions: [], autoClosed: true };
    }
    decisions.push({
      id: dpId(pos, 'target_hit', book.date),
      positionId: pos.id,
      kind: 'target_hit',
      date: book.date,
      title: 'Profit target hit',
      message: `Your target is in reach: closing now locks in about ${(b.targetPl * 100 * pos.qty).toFixed(0)} dollars.`,
      options: ['close', 'hold', 'roll'],
      planned: 'close',
    });
  } else if (
    b.stopPl !== null &&
    mark &&
    optionLegsOf(pos.legs).length > 0 &&
    plIfClosedAt(pos, q.mid) <= -b.stopPl + 1e-9
  ) {
    if (ctx.autoBrackets || !ctx.pause.stop_hit) {
      const ex = contractCents(q.mid - q.natural, pos.qty);
      pos = closePosition(
        pos,
        q.natural,
        book.date,
        'stop',
        feesFor(pos.legs, pos.qty, ctx.realism.fees),
        'Stop filled at the natural price',
      );
      pos = {
        ...pos,
        executionCents: pos.executionCents + ex,
        flags: { ...pos.flags, closedAtPlan: 'stop' },
      };
      return { pos, decisions: [], autoClosed: true };
    }
    decisions.push({
      id: dpId(pos, 'stop_hit', book.date),
      positionId: pos.id,
      kind: 'stop_hit',
      date: book.date,
      title: 'Stop hit',
      message:
        'The trade reached the stop you planned. Taking it now keeps a bad trade from becoming a disaster.',
      options: ['close', 'hold', 'roll'],
      planned: 'close',
    });
  }

  const shorts = optionLegsOf(pos.legs).filter((l) => l.ratio < 0);
  if (
    !pos.flags.shortTouched &&
    shorts.some((s) => (s.right === 'P' ? book.spot <= s.strike : book.spot >= s.strike))
  ) {
    pos = { ...pos, flags: { ...pos.flags, shortTouched: true } };
    if (want('short_touched'))
      decisions.push({
        id: dpId(pos, 'short_touched', book.date),
        positionId: pos.id,
        kind: 'short_touched',
        date: book.date,
        title: 'Short strike touched',
        message: 'The stock has reached your short strike. Hold, close, or roll further out.',
        options: ['hold', 'close', 'roll', 'adjust'],
      });
  }

  if (!pos.flags.dte21 && dte !== null && dte <= 21 && pos.entry.dte > 21) {
    pos = { ...pos, flags: { ...pos.flags, dte21: true } };
    if (want('dte21'))
      decisions.push({
        id: dpId(pos, 'dte21', book.date),
        positionId: pos.id,
        kind: 'dte21',
        date: book.date,
        title: '21 days to expiration',
        message: 'From here gamma grows fast. Many traders close or roll winners now.',
        options: ['hold', 'close', 'roll'],
      });
  }

  if (book.earningsTomorrow && pos.flags.earningsWarned !== book.date && optionLegsOf(pos.legs).length > 0) {
    pos = { ...pos, flags: { ...pos.flags, earningsWarned: book.date, earningsHeld: true } };
    if (want('earnings_tomorrow'))
      decisions.push({
        id: dpId(pos, 'earnings_tomorrow', book.date),
        positionId: pos.id,
        kind: 'earnings_tomorrow',
        date: book.date,
        title: 'Earnings tomorrow',
        message: 'The company reports before the next session. Expect a gap and an IV crush.',
        options: ['hold', 'close', 'roll'],
      });
  }

  if (book.exDivTomorrow && pos.flags.exdivWarned !== book.date) {
    const itmShortCall = shorts.find((s) => s.right === 'C' && book.spot > s.strike);
    if (itmShortCall) {
      pos = { ...pos, flags: { ...pos.flags, exdivWarned: book.date } };
      if (want('exdiv_itm_call'))
        decisions.push({
          id: dpId(pos, 'exdiv_itm_call', book.date),
          positionId: pos.id,
          kind: 'exdiv_itm_call',
          date: book.date,
          title: 'Ex-dividend tomorrow',
          message: `Your short ${itmShortCall.strike} call is in the money and the stock goes ex-dividend tomorrow. Early assignment is likely tonight.`,
          options: ['hold', 'close', 'roll'],
        });
    }
  }

  if (!pos.flags.pinWarned && dte === 0) {
    const pinned = shorts.find((s) => {
      const longOther = optionLegsOf(pos.legs).find(
        (l) => l.ratio > 0 && l.right === s.right && l.expiration === s.expiration,
      );
      const lo = longOther ? Math.min(s.strike, longOther.strike) : s.strike * 0.995;
      const hi = longOther ? Math.max(s.strike, longOther.strike) : s.strike * 1.005;
      return book.spot > lo && book.spot < hi;
    });
    if (pinned) {
      pos = { ...pos, flags: { ...pos.flags, pinWarned: true } };
      if (want('pin_risk'))
        decisions.push({
          id: dpId(pos, 'pin_risk', book.date),
          positionId: pos.id,
          kind: 'pin_risk',
          date: book.date,
          title: 'Pin risk at expiration',
          message:
            'The stock closed right at your short strike on expiration day. In the money by even a cent means assignment; out of the money expires worthless. Close now to take the uncertainty off.',
          options: ['close', 'hold'],
          planned: 'close',
        });
    }
  }
  return { pos, decisions, autoClosed: false };
}

export interface EndOfDayResult {
  pos: Position;
  assignedToday: boolean;
}

/** Part 2: after decisions. Early assignment, then expiration. */
export function endOfDay(input: Position, book: DayBook, ctx: DayContext): EndOfDayResult {
  let pos = input;
  if (pos.status !== 'open') return { pos, assignedToday: false };
  let assignedToday = false;

  if (ctx.realism.earlyAssignment) {
    for (const leg of optionLegsOf(pos.legs).filter((l) => l.ratio < 0 && l.expiration > book.date)) {
      const snap = book.quote(leg);
      const mid = snap ? (snap.bid + snap.ask) / 2 : intrinsic(leg, book.spot);
      const extrinsic = mid - intrinsic(leg, book.spot);
      let assign = false;
      if (
        leg.right === 'C' &&
        book.spot > leg.strike &&
        book.exDivTomorrow &&
        extrinsic < book.exDivTomorrow.amount
      )
        assign = true;
      if (leg.right === 'P' && leg.strike > book.spot * 1.02 && extrinsic < 0.05 && ctx.rng.chance(0.2))
        assign = true;
      if (assign) {
        pos = convertLegToStock(pos, leg, book.date, 'assigned');
        assignedToday = true;
      }
    }
  }

  const expiring = optionLegsOf(pos.legs).filter((l) => l.expiration <= book.date);
  if (expiring.length > 0) {
    if (!ctx.realism.expirationMechanics) {
      for (const leg of expiring) pos = settleLegAtIntrinsic(pos, leg, book.spot);
    } else {
      // Exercise by exception, as at a real broker: in the money by a cent or more is exercised
      // (or assigned); out of the money expires worthless. Both legs of a vertical in the money
      // settle at max value (the share legs cancel).
      for (const leg of expiring) {
        const exercised = intrinsic(leg, book.spot) >= 0.01;
        if (exercised) {
          pos = convertLegToStock(pos, leg, book.date, leg.ratio < 0 ? 'assigned' : 'exercise');
          if (leg.ratio < 0) assignedToday = true;
        } else {
          pos = { ...pos, legs: removeLeg(pos.legs, leg) };
        }
      }
    }
    pos = addEvent(pos, { date: book.date, kind: 'expired', detail: `${expiring.length} leg(s) expired` });
  }

  // A covered call is done when its call expires worthless: the premium is kept and the shares
  // are sold at that close, so the trade's result stops at expiration instead of drifting with
  // shares held afterwards.
  if (
    pos.structureId === 'covered_call' &&
    expiring.length > 0 &&
    optionLegsOf(pos.legs).length === 0 &&
    stockRatio(pos.legs) !== 0 &&
    !pos.flags.assigned
  ) {
    const shares = stockRatio(pos.legs);
    const cashDelta = contractCents(shares * book.spot, pos.qty);
    pos = addEvent(
      { ...pos, legs: [], cashCents: pos.cashCents + cashDelta },
      {
        date: book.date,
        kind: 'close',
        detail: `Call expired worthless: premium kept; ${Math.abs(shares * 100 * pos.qty)} shares sold at the close (${book.spot.toFixed(2)})`,
        cashCents: cashDelta,
      },
    );
  }

  if (pos.legs.length === 0) {
    const reason = pos.flags.assigned ? 'assigned' : 'expired';
    const realized: Cents = pos.cashCents - pos.feesCents;
    pos = { ...pos, status: 'closed', closedOn: book.date, exitReason: reason, realizedCents: realized };
  } else {
    pos = markPosition(pos, book);
    if (assignedToday && stockRatio(pos.legs) !== 0)
      pos = { ...pos, flags: { ...pos.flags, assignedPending: true } };
  }
  return { pos, assignedToday };
}

/** DTE of the front leg, for display. */
export function daysToExpiry(pos: Position, date: string): number | null {
  const exps = optionLegsOf(pos.legs)
    .map((l) => l.expiration)
    .sort();
  return exps.length ? diffDays(date, exps[0]) : null;
}
