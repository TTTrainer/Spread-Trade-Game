/**
 * Player actions on open positions: close, roll, adjust, exercise, and selling assigned shares.
 * Each goes through the same fill model as an opening order.
 */

import type { ISODate } from '../calendar';
import { contractCents, type Cents } from '../money';
import type { Rng } from '../rng';
import {
  attemptFill,
  BASE_EXECUTION,
  type ComboQuote,
  type ExecutionMods,
  type FillAttempt,
  type FillResult,
} from '../orders/fill';
import { feesFor } from '../orders/rules';
import type { Leg, OptionLeg } from '../strategies/types';
import {
  changeLegs,
  closePosition,
  closeQuote,
  convertLegToStock,
  markPosition,
  optionLegsOf,
  stockRatio,
} from './position';
import type { DayBook, ExitReason, Position } from './types';

/** Quote for executing legs as given (ratio > 0 buys at the ask). Cost convention: + pay / - receive. */
export function executionQuote(legs: Leg[], book: DayBook): ComboQuote | null {
  let m = 0;
  let n = 0;
  for (const leg of legs) {
    if (leg.kind === 'stock') {
      m += leg.ratio * book.spot;
      n += leg.ratio * book.spot;
      continue;
    }
    const q = book.quote(leg);
    if (!q) return null;
    m += leg.ratio * ((q.bid + q.ask) / 2);
    n += leg.ratio * (leg.ratio > 0 ? q.ask : q.bid);
  }
  return { mid: m, natural: n };
}

/** Without the bid/ask realism toggle every fill happens at mid. */
export function applyBidAskToggle(q: ComboQuote, bidAsk: boolean): ComboQuote {
  return bidAsk ? q : { mid: q.mid, natural: q.mid };
}

export interface ActionEnv {
  book: DayBook;
  rng: Rng;
  mods?: ExecutionMods;
  feesOn: boolean;
  bidAsk: boolean;
}

export interface ActionResult {
  pos: Position;
  fill: FillResult;
  executionCents: Cents;
}

function execCents(q: ComboQuote, price: number, qty: number): Cents {
  // Negative: money paid away versus the mid.
  return contractCents(q.mid - price, qty);
}

export function closeAction(
  pos: Position,
  attempt: FillAttempt,
  env: ActionEnv,
  reason: ExitReason = 'manual',
): ActionResult {
  const q = applyBidAskToggle(closeQuote(pos.legs, env.book, pos.lastLegs), env.bidAsk);
  const fill = attemptFill(q, attempt, env.rng, env.mods ?? BASE_EXECUTION);
  if (!fill.filled) return { pos, fill, executionCents: 0 };
  const ex = execCents(q, fill.price, pos.qty);
  let next = closePosition(pos, fill.price, env.book.date, reason, feesFor(pos.legs, pos.qty, env.feesOn));
  next = {
    ...next,
    entry: next.entry,
    flags: {
      ...next.flags,
      closedAtPlan: reason === 'target' || reason === 'stop' ? reason : next.flags.closedAtPlan,
    },
  };
  return { pos: withExecution(next, ex), fill, executionCents: ex };
}

/** Assigned shares are sold at the next session's open (standing in for after-hours movement). */
export function sellSharesAtOpen(pos: Position, env: ActionEnv): ActionResult {
  const sr = stockRatio(pos.legs);
  const stockLegs: Leg[] = pos.legs.filter((l) => l.kind === 'stock');
  if (sr === 0)
    return {
      pos,
      fill: { filled: false, price: 0, probability: 0, reason: 'No shares to sell.' },
      executionCents: 0,
    };
  const cost = -sr * env.book.open;
  const onlyStock = optionLegsOf(pos.legs).length === 0;
  const next = onlyStock
    ? closePosition(pos, cost, env.book.date, 'assigned', 0, 'Sold assigned shares at the open')
    : changeLegs(pos, stockLegs, [], cost, 0, env.book.date, 'adjust');
  return {
    pos: onlyStock ? next : markPosition(next, env.book),
    fill: { filled: true, price: cost, probability: 1 },
    executionCents: 0,
  };
}

/**
 * Roll: close the current option legs and open new ones in one combo order.
 * Rolls pay a little extra slippage unless the player owns Legging Pro (or a Roll Voucher fills it at mid).
 */
export function rollAction(
  pos: Position,
  newLegs: OptionLeg[],
  attempt: FillAttempt,
  env: ActionEnv,
): ActionResult {
  const old = optionLegsOf(pos.legs);
  const exec: Leg[] = [...old.map((l) => ({ ...l, ratio: -l.ratio })), ...newLegs];
  const raw = executionQuote(exec, env.book);
  if (!raw)
    return {
      pos,
      fill: { filled: false, price: 0, probability: 0, reason: 'No quote for a new leg.' },
      executionCents: 0,
    };
  const q = applyBidAskToggle(raw, env.bidAsk);
  const fill = attemptFill(q, { ...attempt, isRoll: true }, env.rng, env.mods ?? BASE_EXECUTION);
  if (!fill.filled) return { pos, fill, executionCents: 0 };
  const fees = feesFor(old, pos.qty, env.feesOn) + feesFor(newLegs, pos.qty, env.feesOn);
  const ex = execCents(q, fill.price, pos.qty);
  const next = markPosition(changeLegs(pos, old, newLegs, fill.price, fees, env.book.date, 'roll'), env.book);
  return { pos: withExecution(next, ex), fill, executionCents: ex };
}

/** Adjust: add and/or remove legs (ratios as held; removing a short leg buys it back). */
export function adjustAction(
  pos: Position,
  add: Leg[],
  remove: Leg[],
  attempt: FillAttempt,
  env: ActionEnv,
): ActionResult {
  const exec: Leg[] = [...remove.map((l) => ({ ...l, ratio: -l.ratio })), ...add];
  const raw = executionQuote(exec, env.book);
  if (!raw)
    return {
      pos,
      fill: { filled: false, price: 0, probability: 0, reason: 'No quote for that leg.' },
      executionCents: 0,
    };
  const q = applyBidAskToggle(raw, env.bidAsk);
  const fill = attemptFill(q, { ...attempt, isRoll: true }, env.rng, env.mods ?? BASE_EXECUTION);
  if (!fill.filled) return { pos, fill, executionCents: 0 };
  const fees = feesFor(exec, pos.qty, env.feesOn);
  const ex = execCents(q, fill.price, pos.qty);
  let next = changeLegs(pos, remove, add, fill.price, fees, env.book.date, 'adjust');
  if (next.legs.length === 0)
    next = {
      ...next,
      status: 'closed',
      closedOn: env.book.date,
      exitReason: 'manual',
      realizedCents: next.cashCents - next.feesCents,
    };
  else next = markPosition(next, env.book);
  return { pos: withExecution(next, ex), fill, executionCents: ex };
}

/** Exercise a long option early: it becomes stock at the strike. */
export function exerciseAction(pos: Position, leg: OptionLeg, date: ISODate, book: DayBook): Position {
  if (leg.ratio <= 0) return pos;
  return markPosition(convertLegToStock(pos, leg, date, 'exercise'), book);
}

export function forceCloseAtWindowEnd(pos: Position, env: ActionEnv): Position {
  if (pos.status !== 'open') return pos;
  const q = applyBidAskToggle(closeQuote(pos.legs, env.book, pos.lastLegs), env.bidAsk);
  const next = closePosition(
    pos,
    q.natural,
    env.book.date,
    'window_end',
    feesFor(pos.legs, pos.qty, env.feesOn),
    'Closed at the end of the window',
  );
  return withExecution(next, execCents(q, q.natural, pos.qty));
}

/** Execution cost is tracked on the position for P/L attribution. */
function withExecution(pos: Position, cents: Cents): Position {
  return { ...pos, executionCents: pos.executionCents + cents };
}
