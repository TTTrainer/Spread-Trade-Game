/**
 * Position bookkeeping. Cash flows are integer cents; the legs' market value is marked each
 * close. At every moment P/L = cash + market value of the legs - fees, so rolls, assignments,
 * dividends and exercises all reduce to "move cash, change legs".
 */

import { diffDays, type ISODate } from '../calendar';
import { contractCents, type Cents } from '../money';
import { bsm } from '../pricing/bsm';
import { mid } from '../strategies/structures';
import type { Leg, OptionLeg, StructureId } from '../strategies/types';
import type { ComboQuote } from '../orders/fill';
import type { Brackets, DayBook, EntrySnapshot, LegSnapshot, Mark, Position, PositionEvent } from './types';

export const optionLegsOf = (legs: Leg[]): OptionLeg[] =>
  legs.filter((l): l is OptionLeg => l.kind === 'option');
export const stockRatio = (legs: Leg[]): number =>
  legs.filter((l) => l.kind === 'stock').reduce((a, l) => a + l.ratio, 0);

const intrinsic = (leg: OptionLeg, spot: number) =>
  leg.right === 'C' ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot);

/** Snapshot one leg from today's quote, or model it (BSM with the last known IV) when the quote is missing. */
export function legSnapshot(leg: OptionLeg, book: DayBook, prev?: LegSnapshot): LegSnapshot {
  const q = book.quote(leg);
  if (q)
    return {
      mid: mid(q),
      iv: q.iv,
      delta: q.delta,
      gamma: q.gamma,
      theta: q.theta,
      vega: q.vega,
      modeled: false,
    };
  const t = Math.max(0, diffDays(book.date, leg.expiration)) / 365;
  const iv = prev?.iv ?? 0.3;
  if (t <= 0) {
    const v = intrinsic(leg, book.spot);
    return {
      mid: v,
      iv,
      delta: v > 0 ? (leg.right === 'C' ? 1 : -1) : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      modeled: true,
    };
  }
  const g = bsm({
    right: leg.right,
    spot: book.spot,
    strike: leg.strike,
    t,
    vol: iv,
    rate: book.rate,
    divYield: book.divYield,
  });
  return { mid: g.price, iv, delta: g.delta, gamma: g.gamma, theta: g.theta, vega: g.vega, modeled: true };
}

export interface Valuation {
  value: number;
  snapshots: LegSnapshot[];
  greeks: Mark['greeks'];
  modeled: boolean;
}

export function valueLegs(legs: Leg[], book: DayBook, prev: LegSnapshot[] = []): Valuation {
  let value = 0;
  const greeks = { delta: 0, gamma: 0, theta: 0, vega: 0 };
  const snapshots: LegSnapshot[] = [];
  let modeled = false;
  let oi = 0;
  for (const leg of legs) {
    if (leg.kind === 'stock') {
      value += leg.ratio * book.spot;
      greeks.delta += leg.ratio * 100;
      snapshots.push({
        stock: true,
        mid: book.spot,
        iv: 0,
        delta: 1,
        gamma: 0,
        theta: 0,
        vega: 0,
        modeled: false,
      });
      continue;
    }
    const s = legSnapshot(leg, book, prev[oi]);
    oi++;
    snapshots.push(s);
    modeled ||= s.modeled;
    value += leg.ratio * s.mid;
    greeks.delta += leg.ratio * s.delta * 100;
    greeks.gamma += leg.ratio * s.gamma * 100;
    greeks.theta += leg.ratio * s.theta * 100;
    greeks.vega += leg.ratio * s.vega * 100;
  }
  return { value, snapshots, greeks, modeled };
}

/** Quote for closing all legs, in cost terms (positive = you pay to close). */
export function closeQuote(
  legs: Leg[],
  book: DayBook,
  prev: LegSnapshot[] = [],
  stockPrice?: number,
): ComboQuote {
  let midCost = 0;
  let natCost = 0;
  let oi = 0;
  for (const leg of legs) {
    const exec = -leg.ratio;
    if (leg.kind === 'stock') {
      const px = stockPrice ?? book.spot;
      midCost += exec * px;
      natCost += exec * px;
      continue;
    }
    const q = book.quote(leg);
    const snap = q ? null : legSnapshot(leg, book, prev[oi]);
    oi++;
    const bid = q ? q.bid : Math.max(0, (snap as LegSnapshot).mid - 0.05);
    const ask = q ? q.ask : (snap as LegSnapshot).mid + 0.05;
    midCost += exec * ((bid + ask) / 2);
    natCost += exec * (exec > 0 ? ask : bid);
  }
  return { mid: midCost, natural: natCost };
}

export function plCents(pos: Position, value: number): Cents {
  return pos.cashCents + contractCents(value, pos.qty) - pos.feesCents;
}

export interface OpenParams {
  id: string;
  cardId: string;
  windowId: number;
  symbol: string;
  structureId: StructureId;
  legs: Leg[];
  qty: number;
  date: ISODate;
  fillNet: number;
  midNet: number;
  feesCents: Cents;
  collateralCents: Cents;
  brackets: Brackets;
  entry: EntrySnapshot;
  book: DayBook;
}

export function openPosition(p: OpenParams): Position {
  const cash = -contractCents(p.fillNet, p.qty);
  const pos: Position = {
    id: p.id,
    cardId: p.cardId,
    windowId: p.windowId,
    symbol: p.symbol,
    structureId: p.structureId,
    legs: p.legs,
    qty: p.qty,
    openedOn: p.date,
    openNet: p.fillNet,
    openMid: p.midNet,
    cashCents: cash,
    feesCents: p.feesCents,
    executionCents: contractCents(p.midNet - p.fillNet, p.qty),
    collateralCents: p.collateralCents,
    brackets: p.brackets,
    status: 'open',
    closedOn: null,
    exitReason: null,
    realizedCents: null,
    marks: [],
    events: [
      {
        date: p.date,
        kind: 'open',
        detail: `Opened ${p.qty} at ${p.fillNet < 0 ? 'a credit of ' : 'a debit of '}${Math.abs(p.fillNet).toFixed(2)}`,
        cashCents: cash,
      },
    ],
    entry: p.entry,
    flags: {
      shortTouched: false,
      dte21: false,
      earningsWarned: null,
      exdivWarned: null,
      pinWarned: false,
      stopDeclined: false,
      targetDeclined: false,
      assigned: false,
      assignedPending: false,
      heldIntoLast7: false,
      rolledForDebit: false,
      rolls: 0,
      rollsForCredit: 0,
      closedAtPlan: null,
      earningsHeld: false,
      dividendsCents: 0,
      exercised: false,
    },
    lastLegs: [],
  };
  return markPosition(pos, p.book);
}

export function markPosition(pos: Position, book: DayBook): Position {
  const v = valueLegs(pos.legs, book, pos.lastLegs);
  const mark: Mark = {
    date: book.date,
    spot: book.spot,
    value: v.value,
    plCents: plCents(pos, v.value),
    legs: v.snapshots,
    ratios: pos.legs.map((l) => l.ratio),
    greeks: v.greeks,
    modeled: v.modeled,
  };
  const marks =
    pos.marks.length && pos.marks[pos.marks.length - 1].date === book.date
      ? [...pos.marks.slice(0, -1), mark]
      : [...pos.marks, mark];
  return { ...pos, marks, lastLegs: v.snapshots.filter((_, i) => pos.legs[i]?.kind === 'option') };
}

export function lastMark(pos: Position): Mark | null {
  return pos.marks[pos.marks.length - 1] ?? null;
}

/** Credit received (positive) or debit paid (negative) at open, per share per unit. */
export function openCredit(pos: Position): number {
  return -pos.openNet;
}

/** Default brackets: credit trades target 50% of max profit and stop at 2x the credit; debits +50% / -50%. */
export function defaultBrackets(
  openNet: number,
  targetPct = 0.5,
  stopMult = 2,
  debitTarget = 0.5,
  debitStop = 0.5,
): Brackets {
  if (openNet < 0) {
    const credit = -openNet;
    // A 2x stop closes when the loss reaches twice the credit collected.
    return { targetPl: credit * targetPct, stopPl: credit * stopMult, targetPct, stopMult };
  }
  return {
    targetPl: openNet * debitTarget,
    stopPl: openNet * debitStop,
    targetPct: debitTarget,
    stopMult: null,
  };
}

/** P/L per share per unit if closed at a given cost. */
export function plIfClosedAt(pos: Position, closeCost: number): number {
  const cashPerUnit = pos.cashCents / (100 * 100 * pos.qty);
  return cashPerUnit - closeCost;
}

export function addEvent(pos: Position, e: PositionEvent): Position {
  return { ...pos, events: [...pos.events, e] };
}

/** Close every remaining leg at a cost (per share per unit). */
export function closePosition(
  pos: Position,
  cost: number,
  date: ISODate,
  reason: Position['exitReason'],
  feesCents: Cents,
  detail?: string,
): Position {
  const cashDelta = -contractCents(cost, pos.qty);
  const cashCents = pos.cashCents + cashDelta;
  const fees = pos.feesCents + feesCents;
  const closed: Position = {
    ...pos,
    legs: [],
    cashCents,
    feesCents: fees,
    status: 'closed',
    closedOn: date,
    exitReason: reason,
    realizedCents: cashCents - fees,
  };
  return addEvent(closed, {
    date,
    kind: 'close',
    detail: detail ?? `Closed (${reason}) at ${cost.toFixed(2)}`,
    cashCents: cashDelta,
  });
}

/** Replace some legs with others in one order (rolls and adjustments). Cost is per share per unit. */
export function changeLegs(
  pos: Position,
  remove: Leg[],
  add: Leg[],
  cost: number,
  feesCents: Cents,
  date: ISODate,
  kind: 'roll' | 'adjust',
): Position {
  const keep = [...pos.legs];
  for (const r of remove) {
    const i = keep.findIndex((l) => sameLeg(l, r));
    if (i >= 0) keep.splice(i, 1);
  }
  const legs = mergeLegs([...keep, ...add]);
  const cashDelta = -contractCents(cost, pos.qty);
  const flags = { ...pos.flags };
  if (kind === 'roll') {
    flags.rolls++;
    if (cost < 0) flags.rollsForCredit++;
    else flags.rolledForDebit = true;
    flags.shortTouched = false;
    flags.dte21 = false;
    flags.pinWarned = false;
  }
  const next: Position = {
    ...pos,
    legs,
    cashCents: pos.cashCents + cashDelta,
    feesCents: pos.feesCents + feesCents,
    flags,
    lastLegs: [],
  };
  return addEvent(next, {
    date,
    kind,
    detail: `${kind === 'roll' ? 'Rolled' : 'Adjusted'} for a ${cost < 0 ? 'credit' : 'debit'} of ${Math.abs(cost).toFixed(2)}`,
    cashCents: cashDelta,
  });
}

/** Remove the first leg equal in value to `leg` (legs are copied often, so never compare references). */
export function removeLeg(legs: Leg[], leg: Leg): Leg[] {
  const i = legs.findIndex((l) =>
    l.kind === 'stock'
      ? leg.kind === 'stock'
      : leg.kind === 'option' &&
        l.right === leg.right &&
        l.expiration === leg.expiration &&
        Math.abs(l.strike - leg.strike) < 1e-6 &&
        l.ratio === leg.ratio,
  );
  return i < 0 ? legs : [...legs.slice(0, i), ...legs.slice(i + 1)];
}

export function sameLeg(a: Leg, b: Leg): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'stock') return true;
  const o = b as OptionLeg;
  return (
    a.right === o.right &&
    a.expiration === o.expiration &&
    Math.abs(a.strike - o.strike) < 1e-6 &&
    Math.sign(a.ratio) === Math.sign(o.ratio)
  );
}

/** Net out identical contracts and stock so legs stay canonical. */
export function mergeLegs(legs: Leg[]): Leg[] {
  const out: Leg[] = [];
  let stock = 0;
  for (const l of legs) {
    if (l.kind === 'stock') {
      stock += l.ratio;
      continue;
    }
    const same = out.find(
      (o) =>
        o.kind === 'option' &&
        o.right === l.right &&
        o.expiration === l.expiration &&
        Math.abs(o.strike - l.strike) < 1e-6,
    ) as OptionLeg | undefined;
    if (same) same.ratio += l.ratio;
    else out.push({ ...l });
  }
  const opts = out.filter((l) => l.kind === 'option' && Math.abs(l.ratio) > 1e-9);
  return Math.abs(stock) > 1e-9 ? [{ kind: 'stock', ratio: stock }, ...opts] : opts;
}

/**
 * Turn an option leg into stock at its strike (exercise or assignment).
 * Call: buyer receives shares, pays strike. Put: buyer delivers shares, receives strike.
 */
export function convertLegToStock(
  pos: Position,
  leg: OptionLeg,
  date: ISODate,
  kind: 'exercise' | 'assigned',
): Position {
  const shares = leg.right === 'C' ? leg.ratio : -leg.ratio;
  const cashPerShare = leg.right === 'C' ? -leg.ratio * leg.strike : leg.ratio * leg.strike;
  const cashDelta = contractCents(cashPerShare, pos.qty);
  const remaining = removeLeg(pos.legs, leg);
  const legs = mergeLegs([...remaining, { kind: 'stock', ratio: shares }]);
  const flags = { ...pos.flags };
  if (kind === 'assigned') flags.assigned = true;
  else flags.exercised = true;
  const verb = kind === 'assigned' ? 'Assigned' : 'Exercised';
  return addEvent(
    { ...pos, legs, cashCents: pos.cashCents + cashDelta, flags, lastLegs: [] },
    {
      date,
      kind,
      detail: `${verb}: ${leg.ratio > 0 ? 'long' : 'short'} ${leg.strike} ${leg.right === 'C' ? 'call' : 'put'} became ${Math.abs(shares * 100 * pos.qty)} shares`,
      cashCents: cashDelta,
    },
  );
}

/** Covered calls and cash-secured puts trade against shares kept off the books. */
export const isIncomeTrade = (structureId: string): boolean =>
  structureId === 'covered_call' || structureId === 'cash_secured_put';

/**
 * An assignment on a covered call or cash-secured put. Both trade against 500 shares the player
 * is assumed to own, kept off the books: the shares are called away from (or bought into) that
 * holding, and the trade settles at the option's intrinsic value, so its result is the option's
 * alone (the premium, less what the assignment was worth). Nothing is left holding shares.
 */
export function settleIncomeAssignment(pos: Position, leg: OptionLeg, date: ISODate, spot: number): Position {
  const cashDelta = contractCents(leg.ratio * intrinsic(leg, spot), pos.qty);
  const shares = Math.abs(leg.ratio) * 100 * pos.qty;
  const detail =
    leg.right === 'C'
      ? `Called away: ${shares} of your shares sold at ${leg.strike} (the stock is at ${spot.toFixed(2)}; the gain past the strike is what the call gave up)`
      : `Assigned: bought ${shares} shares at ${leg.strike} into your holding (the stock is at ${spot.toFixed(2)})`;
  return addEvent(
    {
      ...pos,
      legs: removeLeg(pos.legs, leg),
      cashCents: pos.cashCents + cashDelta,
      flags: { ...pos.flags, assigned: true },
      lastLegs: [],
    },
    { date, kind: 'assigned', detail, cashCents: cashDelta },
  );
}

/**
 * A covered call over an ex-dividend date: the dividend goes to your shares, off the books (it is
 * not this trade's P/L), and is noted so the Income desk's dividend bonuses still count it.
 */
export function noteCoveredDividend(pos: Position, amountPerShare: number, date: ISODate): Position {
  const covered = optionLegsOf(pos.legs).some((l) => l.right === 'C' && l.ratio < 0);
  if (!covered) return pos;
  const amount = contractCents(amountPerShare, pos.qty);
  return addEvent(
    { ...pos, flags: { ...pos.flags, dividendsCents: pos.flags.dividendsCents + amount } },
    {
      date,
      kind: 'dividend',
      detail: `Dividend ${amountPerShare.toFixed(2)}/share on your shares (kept off this trade's P/L)`,
      cashCents: amount,
    },
  );
}

/** Cash-settle an expiring leg at intrinsic value (expiration mechanics off, or both legs ITM). */
export function settleLegAtIntrinsic(pos: Position, leg: OptionLeg, spot: number): Position {
  const cashDelta = contractCents(leg.ratio * intrinsic(leg, spot), pos.qty);
  return { ...pos, legs: removeLeg(pos.legs, leg), cashCents: pos.cashCents + cashDelta };
}

export function applyDividend(pos: Position, amountPerShare: number, date: ISODate): Position {
  const sr = stockRatio(pos.legs);
  if (sr === 0) return pos;
  const cashDelta = contractCents(sr * amountPerShare, pos.qty);
  const flags = { ...pos.flags, dividendsCents: pos.flags.dividendsCents + cashDelta };
  return addEvent(
    { ...pos, cashCents: pos.cashCents + cashDelta, flags },
    { date, kind: 'dividend', detail: `Dividend ${amountPerShare.toFixed(2)}/share`, cashCents: cashDelta },
  );
}

export function frontDte(pos: Position, date: ISODate): number | null {
  const exps = optionLegsOf(pos.legs)
    .map((l) => l.expiration)
    .sort();
  return exps.length ? diffDays(date, exps[0]) : null;
}

export { intrinsic };
