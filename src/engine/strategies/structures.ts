import type { ISODate } from '../calendar';
import type { Chain, OptionQuote, OptionRight } from '../market/types';
import type { BuildParams, BuildResult, Leg, OptionLeg, StructureDef, StructureId } from './types';

export const STRUCTURES: Record<StructureId, StructureDef> = {
  bull_put: {
    id: 'bull_put',
    name: 'Bull Put Spread',
    short: 'BULL PUT',
    family: 'vertical',
    bias: 'bull',
    credit: true,
    baseChips: 30,
    twoExpiries: false,
    reverse: 'bear_call',
    defaults: { delta: 0.3, width: 2 },
    blurb: 'Sell a put, buy a cheaper one below. Profit if the stock stays above the short strike.',
  },
  bear_call: {
    id: 'bear_call',
    name: 'Bear Call Spread',
    short: 'BEAR CALL',
    family: 'vertical',
    bias: 'bear',
    credit: true,
    baseChips: 30,
    twoExpiries: false,
    reverse: 'bull_put',
    defaults: { delta: 0.3, width: 2 },
    blurb: 'Sell a call, buy a pricier strike above. Profit if the stock stays below the short strike.',
  },
  bull_call: {
    id: 'bull_call',
    name: 'Bull Call Spread',
    short: 'BULL CALL',
    family: 'vertical',
    bias: 'bull',
    credit: false,
    baseChips: 25,
    twoExpiries: false,
    reverse: 'bear_put',
    defaults: { delta: 0.5, width: 2 },
    blurb: 'Buy a call, sell a higher one. Pay a debit for a capped bet on a rise.',
  },
  bear_put: {
    id: 'bear_put',
    name: 'Bear Put Spread',
    short: 'BEAR PUT',
    family: 'vertical',
    bias: 'bear',
    credit: false,
    baseChips: 25,
    twoExpiries: false,
    reverse: 'bull_call',
    defaults: { delta: 0.5, width: 2 },
    blurb: 'Buy a put, sell a lower one. Pay a debit for a capped bet on a drop.',
  },
  iron_condor: {
    id: 'iron_condor',
    name: 'Iron Condor',
    short: 'CONDOR',
    family: 'condor',
    bias: 'neutral',
    credit: true,
    baseChips: 40,
    twoExpiries: false,
    defaults: { delta: 0.2, width: 2 },
    blurb: 'A bull put and a bear call together. Profit if the stock stays in the range.',
  },
  iron_fly: {
    id: 'iron_fly',
    name: 'Iron Butterfly',
    short: 'IRON FLY',
    family: 'condor',
    bias: 'neutral',
    credit: true,
    baseChips: 45,
    twoExpiries: false,
    defaults: { delta: 0.5, width: 3 },
    blurb: 'Sell the at-the-money straddle, buy wings. Big credit, needs a pin.',
  },
  bwb_condor: {
    id: 'bwb_condor',
    name: 'Broken-Wing Condor',
    short: 'BW CONDOR',
    family: 'condor',
    bias: 'neutral',
    credit: true,
    baseChips: 45,
    twoExpiries: false,
    defaults: { delta: 0.2, width: 2, skip: 1 },
    blurb: 'A condor with one wider wing: more credit, more risk on one side.',
  },
  long_straddle: {
    id: 'long_straddle',
    name: 'Long Straddle',
    short: 'STRADDLE',
    family: 'volatility',
    bias: 'long_vol',
    credit: false,
    baseChips: 35,
    twoExpiries: false,
    reverse: 'long_strangle',
    defaults: { delta: 0.5, width: 0 },
    blurb: 'Buy the at-the-money call and put. Profit from a big move either way.',
  },
  long_strangle: {
    id: 'long_strangle',
    name: 'Long Strangle',
    short: 'STRANGLE',
    family: 'volatility',
    bias: 'long_vol',
    credit: false,
    baseChips: 35,
    twoExpiries: false,
    reverse: 'long_straddle',
    defaults: { delta: 0.25, width: 0 },
    blurb: 'Buy an out-of-the-money call and put. Cheaper, needs a bigger move.',
  },
  covered_call: {
    id: 'covered_call',
    name: 'Covered Call',
    short: 'COV CALL',
    family: 'income',
    bias: 'bull',
    credit: true,
    baseChips: 25,
    twoExpiries: false,
    reverse: 'cash_secured_put',
    defaults: { delta: 0.3, width: 0 },
    blurb: 'Own 100 shares, sell a call against them. Income with capped upside.',
  },
  cash_secured_put: {
    id: 'cash_secured_put',
    name: 'Cash-Secured Put',
    short: 'CSP',
    family: 'income',
    bias: 'bull',
    credit: true,
    baseChips: 25,
    twoExpiries: false,
    reverse: 'covered_call',
    defaults: { delta: 0.3, width: 0 },
    blurb: 'Sell a put with the cash to buy the shares. Get paid to wait for a lower price.',
  },
  calendar: {
    id: 'calendar',
    name: 'Calendar Spread',
    short: 'CALENDAR',
    family: 'calendar',
    bias: 'neutral',
    credit: false,
    baseChips: 35,
    twoExpiries: true,
    reverse: 'diagonal',
    defaults: { delta: 0.5, width: 0 },
    blurb: 'Sell a near-term option, buy the same strike further out. Profits from time and a quiet stock.',
  },
  diagonal: {
    id: 'diagonal',
    name: 'Diagonal Spread',
    short: 'DIAGONAL',
    family: 'calendar',
    bias: 'bull',
    credit: false,
    baseChips: 35,
    twoExpiries: true,
    reverse: 'calendar',
    defaults: { delta: 0.3, width: 2 },
    blurb: 'Sell a near-term call, buy a longer-dated lower strike. A calendar with a lean.',
  },
  double_calendar: {
    id: 'double_calendar',
    name: 'Double Calendar',
    short: 'DBL CAL',
    family: 'calendar',
    bias: 'neutral',
    credit: false,
    baseChips: 45,
    twoExpiries: true,
    defaults: { delta: 0.3, width: 0 },
    blurb: 'A put calendar below and a call calendar above. A wide tent for a quiet stock.',
  },
};

export const ALL_STRUCTURES = Object.values(STRUCTURES);

export function structure(id: StructureId): StructureDef {
  return STRUCTURES[id];
}

export const mid = (q: OptionQuote): number => (q.bid + q.ask) / 2;

export function quotesFor(chain: Chain, expiration: ISODate, right: OptionRight): OptionQuote[] {
  return chain.quotes
    .filter((q) => q.expiration === expiration && q.right === right)
    .sort((a, b) => a.strike - b.strike);
}

export function expirationsOf(chain: Chain): ISODate[] {
  return [...new Set(chain.quotes.map((q) => q.expiration))].sort();
}

export function findQuote(
  chain: Chain,
  leg: Pick<OptionLeg, 'expiration' | 'strike' | 'right'>,
): OptionQuote | undefined {
  return chain.quotes.find(
    (q) => q.expiration === leg.expiration && q.right === leg.right && Math.abs(q.strike - leg.strike) < 1e-6,
  );
}

/** The listed strike whose |delta| is closest to the target. */
export function strikeByDelta(
  chain: Chain,
  expiration: ISODate,
  right: OptionRight,
  absDelta: number,
): OptionQuote | null {
  const qs = quotesFor(chain, expiration, right).filter((q) => q.ask > 0);
  let best: OptionQuote | null = null;
  for (const q of qs)
    if (!best || Math.abs(Math.abs(q.delta) - absDelta) < Math.abs(Math.abs(best.delta) - absDelta)) best = q;
  return best;
}

export function nearestStrike(
  chain: Chain,
  expiration: ISODate,
  right: OptionRight,
  price: number,
): OptionQuote | null {
  const qs = quotesFor(chain, expiration, right);
  let best: OptionQuote | null = null;
  for (const q of qs) if (!best || Math.abs(q.strike - price) < Math.abs(best.strike - price)) best = q;
  return best;
}

/** The strike `steps` listed strikes away (positive = higher). */
export function stepStrike(
  chain: Chain,
  expiration: ISODate,
  right: OptionRight,
  from: number,
  steps: number,
): number | null {
  const strikes = quotesFor(chain, expiration, right).map((q) => q.strike);
  const i = strikes.findIndex((k) => Math.abs(k - from) < 1e-6);
  if (i < 0) return null;
  const j = i + steps;
  return j >= 0 && j < strikes.length ? strikes[j] : null;
}

/** Typical strike step near the money for an expiration (used for "within one increment" comparisons). */
export function strikeStep(chain: Chain, expiration: ISODate): number {
  const ks = quotesFor(chain, expiration, 'C').map((q) => q.strike);
  let best = Infinity;
  let near = Infinity;
  for (let i = 1; i < ks.length; i++) {
    const d = Math.abs((ks[i] + ks[i - 1]) / 2 - chain.spot);
    if (d < near) {
      near = d;
      best = ks[i] - ks[i - 1];
    }
  }
  return Number.isFinite(best) ? best : 1;
}

const opt = (right: OptionRight, strike: number, expiration: ISODate, ratio: number): OptionLeg => ({
  kind: 'option',
  right,
  strike,
  expiration,
  ratio,
});

function anchorOrDelta(chain: Chain, exp: ISODate, right: OptionRight, p: BuildParams): number | null {
  if (p.anchor !== undefined) {
    const q = nearestStrike(chain, exp, right, p.anchor);
    return q ? q.strike : null;
  }
  return strikeByDelta(chain, exp, right, p.delta)?.strike ?? null;
}

function vertical(
  chain: Chain,
  p: BuildParams,
  right: OptionRight,
  shortSide: boolean,
  towardHigher: boolean,
): BuildResult {
  if (p.width < 1) return { ok: false, reason: 'Width must be at least one strike.' };
  const a = anchorOrDelta(chain, p.expiration, right, p);
  if (a === null) return { ok: false, reason: 'No quote near that strike for this expiration.' };
  const b = stepStrike(chain, p.expiration, right, a, towardHigher ? p.width : -p.width);
  if (b === null) return { ok: false, reason: 'The far strike is not listed. Try a narrower width.' };
  return {
    ok: true,
    legs: [opt(right, a, p.expiration, shortSide ? -1 : 1), opt(right, b, p.expiration, shortSide ? 1 : -1)],
  };
}

export function buildStructure(id: StructureId, chain: Chain, p: BuildParams): BuildResult {
  const e = p.expiration;
  switch (id) {
    case 'bull_put':
      return vertical(chain, p, 'P', true, false);
    case 'bear_call':
      return vertical(chain, p, 'C', true, true);
    case 'bull_call':
      return vertical(chain, p, 'C', false, true);
    case 'bear_put':
      return vertical(chain, p, 'P', false, false);
    case 'iron_condor':
    case 'bwb_condor': {
      const skip = id === 'bwb_condor' ? (p.skip ?? 1) : 0;
      const put = vertical(chain, { ...p, anchor: undefined, width: p.width }, 'P', true, false);
      const call = vertical(chain, { ...p, anchor: undefined, width: p.width + skip }, 'C', true, true);
      if (!put.ok) return put;
      if (!call.ok) return call;
      const sp = put.legs[0] as OptionLeg;
      const sc = call.legs[0] as OptionLeg;
      if (sp.strike >= sc.strike)
        return { ok: false, reason: 'The short strikes overlap. Pick a lower delta.' };
      return { ok: true, legs: [...put.legs, ...call.legs] };
    }
    case 'iron_fly': {
      const atm =
        p.anchor !== undefined
          ? nearestStrike(chain, e, 'C', p.anchor)
          : nearestStrike(chain, e, 'C', chain.spot);
      if (!atm) return { ok: false, reason: 'No at-the-money strike listed.' };
      const lo = stepStrike(chain, e, 'P', atm.strike, -p.width);
      const hi = stepStrike(chain, e, 'C', atm.strike, p.width);
      if (lo === null || hi === null || p.width < 1)
        return { ok: false, reason: 'A wing strike is not listed. Try a narrower width.' };
      return {
        ok: true,
        legs: [
          opt('P', lo, e, 1),
          opt('P', atm.strike, e, -1),
          opt('C', atm.strike, e, -1),
          opt('C', hi, e, 1),
        ],
      };
    }
    case 'long_straddle': {
      const atm =
        p.anchor !== undefined
          ? nearestStrike(chain, e, 'C', p.anchor)
          : nearestStrike(chain, e, 'C', chain.spot);
      if (!atm || !findQuote(chain, { expiration: e, strike: atm.strike, right: 'P' }))
        return { ok: false, reason: 'No at-the-money strike listed.' };
      return { ok: true, legs: [opt('C', atm.strike, e, 1), opt('P', atm.strike, e, 1)] };
    }
    case 'long_strangle': {
      const c = strikeByDelta(chain, e, 'C', p.delta);
      const pq = strikeByDelta(chain, e, 'P', p.delta);
      if (!c || !pq) return { ok: false, reason: 'No strikes near that delta.' };
      if (pq.strike >= c.strike) return { ok: false, reason: 'The strikes overlap. Pick a lower delta.' };
      return { ok: true, legs: [opt('C', c.strike, e, 1), opt('P', pq.strike, e, 1)] };
    }
    case 'covered_call': {
      const k = anchorOrDelta(chain, e, 'C', p);
      if (k === null) return { ok: false, reason: 'No call near that delta.' };
      return { ok: true, legs: [{ kind: 'stock', ratio: 1 }, opt('C', k, e, -1)] };
    }
    case 'cash_secured_put': {
      const k = anchorOrDelta(chain, e, 'P', p);
      if (k === null) return { ok: false, reason: 'No put near that delta.' };
      return { ok: true, legs: [opt('P', k, e, -1)] };
    }
    case 'calendar':
    case 'diagonal':
    case 'double_calendar': {
      const back = p.backExpiration;
      if (!back || back <= e) return { ok: false, reason: 'Pick a later back-month expiration.' };
      if (id === 'double_calendar') {
        const c = strikeByDelta(chain, e, 'C', p.delta);
        const pq = strikeByDelta(chain, e, 'P', p.delta);
        if (!c || !pq || pq.strike >= c.strike)
          return { ok: false, reason: 'No room for both calendars at that delta.' };
        if (
          !findQuote(chain, { expiration: back, strike: c.strike, right: 'C' }) ||
          !findQuote(chain, { expiration: back, strike: pq.strike, right: 'P' })
        )
          return { ok: false, reason: 'The back month does not list those strikes.' };
        return {
          ok: true,
          legs: [
            opt('P', pq.strike, e, -1),
            opt('P', pq.strike, back, 1),
            opt('C', c.strike, e, -1),
            opt('C', c.strike, back, 1),
          ],
        };
      }
      const k = anchorOrDelta(chain, e, 'C', p);
      if (k === null) return { ok: false, reason: 'No call near that strike.' };
      let backK = k;
      if (id === 'diagonal') {
        const lower = stepStrike(chain, back, 'C', k, -Math.max(1, p.width));
        if (lower === null) return { ok: false, reason: 'The back-month strike is not listed.' };
        backK = lower;
      }
      if (!findQuote(chain, { expiration: back, strike: backK, right: 'C' }))
        return { ok: false, reason: 'The back month does not list that strike.' };
      return { ok: true, legs: [opt('C', k, e, -1), opt('C', backK, back, 1)] };
    }
  }
}

export function optionLegs(legs: Leg[]): OptionLeg[] {
  return legs.filter((l): l is OptionLeg => l.kind === 'option');
}

/** Flip a structure's direction (Alt+R): the build keeps the same expiration, delta and width. */
export function reverseOf(id: StructureId): StructureId {
  return STRUCTURES[id].reverse ?? id;
}
