/**
 * The Trade Builder's readouts for any strategy: where the stock is likely to be at expiration
 * (the lognormal the POP already uses), a plain-language description of the position, and the
 * order as text in thinkorswim's style, for the player to check and enter at the broker themselves.
 * Nothing here sends anything anywhere.
 */

import { diffDays, type ISODate } from '../calendar';
import { normCdf } from '../pricing/bsm';
import { STRUCTURES } from './structures';
import type { Leg, OptionLeg, StructureId } from './types';

/** Density of the price at expiration (lognormal), at each x; integrates to about 1 over price. */
export function priceDensity(
  spot: number,
  sigma: number,
  years: number,
  rate: number,
  xs: number[],
): number[] {
  const t = Math.max(years, 1 / 730);
  const sd = sigma * Math.sqrt(t);
  const mu = Math.log(spot) + (rate - 0.5 * sigma * sigma) * t;
  return xs.map((x) => {
    if (x <= 0 || !(sd > 0)) return 0;
    const z = (Math.log(x) - mu) / sd;
    return Math.exp(-0.5 * z * z) / (x * sd * Math.sqrt(2 * Math.PI));
  });
}

/** The chance the price ends between two levels at expiration. */
export function probBetween(
  spot: number,
  sigma: number,
  years: number,
  rate: number,
  lo: number,
  hi: number,
): number {
  const t = Math.max(years, 1 / 730);
  const sd = sigma * Math.sqrt(t);
  const mu = Math.log(spot) + (rate - 0.5 * sigma * sigma) * t;
  const cdf = (x: number) => (x <= 0 ? 0 : normCdf((Math.log(x) - mu) / sd));
  return Math.max(0, Math.min(1, cdf(hi) - cdf(lo)));
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "17 OCT 25", the way thinkorswim writes an expiration. */
export function tosDate(d: ISODate): string {
  return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}`;
}

const strikeText = (k: number) => (Number.isInteger(k) ? String(k) : String(+k.toFixed(2)));
const rightWord = (r: 'C' | 'P') => (r === 'C' ? 'CALL' : 'PUT');

function optionLegs(legs: Leg[]): OptionLeg[] {
  return legs.filter((l): l is OptionLeg => l.kind === 'option');
}

/** The trade's one option when it is a single option and nothing else (no shares, no other legs). */
export function singleOption(legs: Leg[]): OptionLeg | null {
  return legs.length === 1 && legs[0].kind === 'option' && Math.abs(legs[0].ratio) === 1 ? legs[0] : null;
}

/** What to call the trade: the strategy's name, or "long call", "short put" for a single option. */
export function tradeName(structureId: StructureId, legs: Leg[]): string {
  const one = singleOption(legs);
  if (one) return `${one.ratio < 0 ? 'Short' : 'Long'} ${one.right === 'C' ? 'call' : 'put'}`;
  return STRUCTURES[structureId].name;
}

/**
 * The order in thinkorswim's one-line style: SELL -1 VERTICAL SPY 100 17 OCT 25 450/445 PUT @1.20 LMT.
 * `net` is per share: negative for a credit. Shapes thinkorswim has no single word for come out
 * leg by leg. The player reads it and enters it themselves.
 */
export function orderText(
  symbol: string,
  structureId: StructureId,
  legs: Leg[],
  qty: number,
  net: number,
): string {
  const ol = optionLegs(legs);
  const credit = net < 0;
  const side = credit ? `SELL -${qty}` : `BUY +${qty}`;
  const px = `@${Math.abs(net).toFixed(2)} LMT`;
  const exps = [...new Set(ol.map((l) => l.expiration))].sort();
  const date = exps.map(tosDate).join('/');
  const byStrike = (r: 'C' | 'P', dir: 1 | -1) =>
    ol.filter((l) => l.right === r).sort((a, b) => dir * (a.strike - b.strike));
  const shorts = ol.filter((l) => l.ratio < 0);
  // One option on its own (the course's lessons): thinkorswim's single-leg line.
  const single = singleOption(legs);
  if (single)
    return `${single.ratio < 0 ? `SELL -${qty}` : `BUY +${qty}`} ${symbol} 100 ${tosDate(single.expiration)} ${strikeText(single.strike)} ${rightWord(single.right)} ${px}`;
  switch (structureId) {
    case 'bull_put':
    case 'bear_put': {
      const ks = byStrike('P', -1).map((l) => strikeText(l.strike));
      return `${side} VERTICAL ${symbol} 100 ${date} ${ks.join('/')} PUT ${px}`;
    }
    case 'bear_call':
    case 'bull_call': {
      const ks = byStrike('C', 1).map((l) => strikeText(l.strike));
      return `${side} VERTICAL ${symbol} 100 ${date} ${ks.join('/')} CALL ${px}`;
    }
    case 'iron_condor':
    case 'iron_fly': {
      const calls = byStrike('C', 1).map((l) => strikeText(l.strike));
      const puts = byStrike('P', -1).map((l) => strikeText(l.strike));
      const word = structureId === 'iron_fly' ? 'IRON BUTTERFLY' : 'IRON CONDOR';
      return `${side} ${word} ${symbol} 100 ${date} ${[...calls, ...puts].join('/')} CALL/PUT ${px}`;
    }
    case 'long_straddle': {
      return `${side} STRADDLE ${symbol} 100 ${date} ${strikeText(ol[0]?.strike ?? 0)} ${px}`;
    }
    case 'long_strangle': {
      const c = byStrike('C', 1)[0];
      const p = byStrike('P', 1)[0];
      return `${side} STRANGLE ${symbol} 100 ${date} ${strikeText(c?.strike ?? 0)}/${strikeText(p?.strike ?? 0)} CALL/PUT ${px}`;
    }
    case 'calendar':
    case 'diagonal': {
      const word = structureId === 'calendar' ? 'CALENDAR' : 'DIAGONAL';
      const r = ol[0]?.right ?? 'C';
      const ks = [
        ...new Set(
          ol.sort((a, b) => a.expiration.localeCompare(b.expiration)).map((l) => strikeText(l.strike)),
        ),
      ];
      return `${side} ${word} ${symbol} 100 ${date} ${ks.join('/')} ${rightWord(r)} ${px}`;
    }
    case 'covered_call':
    case 'cash_secured_put': {
      const s = shorts[0];
      if (!s) break;
      return `SELL -${qty} ${symbol} 100 ${tosDate(s.expiration)} ${strikeText(s.strike)} ${rightWord(s.right)} ${px}`;
    }
    default:
      break;
  }
  // Leg by leg: a shape without a one-word name in thinkorswim.
  const parts = ol.map((l) => {
    const n = Math.abs(l.ratio) * qty;
    return `${l.ratio < 0 ? `SELL -${n}` : `BUY +${n}`} ${symbol} 100 ${tosDate(l.expiration)} ${strikeText(l.strike)} ${rightWord(l.right)}`;
  });
  return `${parts.join(' · ')} · NET ${credit ? 'CREDIT' : 'DEBIT'} ${px}`;
}

/** Each leg in plain words: "Sell 1 put at 450, 17 OCT 25 (12 days)". */
export function legLines(legs: Leg[], qty: number, today: ISODate): string[] {
  return legs.map((l) => {
    if (l.kind === 'stock') return `Own ${Math.abs(l.ratio) * qty * 100} shares`;
    const n = Math.abs(l.ratio) * qty;
    return `${l.ratio < 0 ? 'Sell' : 'Buy'} ${n} ${l.right === 'C' ? 'call' : 'put'}${n === 1 ? '' : 's'} at ${strikeText(l.strike)} · ${tosDate(l.expiration)} (${diffDays(today, l.expiration)} days)`;
  });
}

/**
 * The position in one or two plain sentences: what you're paid or pay, what you're betting on, and
 * where it wins and loses. Per-share prices become dollars per contract (×100).
 */
export function describeTrade(opts: {
  symbol: string;
  structureId: StructureId;
  qty: number;
  net: number;
  maxProfit: number | null;
  maxLoss: number;
  breakevens: number[];
  pop: number;
  expiration: ISODate | null;
  /** The legs, so a single option is described as itself rather than as a strategy. */
  legs?: Leg[];
}): string {
  const def = STRUCTURES[opts.structureId];
  const one = opts.legs ? singleOption(opts.legs) : null;
  const dollars = (x: number) => `$${Math.round(Math.abs(x) * 100 * opts.qty).toLocaleString('en-US')}`;
  const when = opts.expiration ? ` at ${tosDate(opts.expiration)}` : '';
  const name = one ? `${one.strike} ${one.right === 'C' ? 'call' : 'put'}` : def.name.toLowerCase();
  const head =
    opts.net < 0
      ? `You SELL the ${name} for ${dollars(opts.net)} up front`
      : `You BUY the ${name} for ${dollars(opts.net)}`;
  const bias: Record<string, string> = {
    bull: `betting ${opts.symbol} stays up`,
    bear: `betting ${opts.symbol} stays down`,
    neutral: `betting ${opts.symbol} stays in a range`,
    long_vol: `betting ${opts.symbol} makes a big move`,
  };
  const be = opts.breakevens.length
    ? ` Breakeven${opts.breakevens.length > 1 ? 's' : ''}${when}: ${opts.breakevens.map((b) => b.toFixed(2)).join(' and ')}.`
    : '';
  const best = opts.maxProfit === null ? 'no fixed cap' : dollars(opts.maxProfit);
  // A single option's bet is set by its side and type, whatever strategy the builder was on.
  const lean = one
    ? one.ratio > 0
      ? `betting ${opts.symbol} ${one.right === 'C' ? 'rises' : 'falls'}`
      : `betting ${opts.symbol} stays ${one.right === 'C' ? 'below' : 'above'} ${one.strike}`
    : (bias[def.bias] ?? 'on the move you expect');
  return `${head}, ${lean}. Best case ${best}, worst case −${dollars(opts.maxLoss)}.${be} Chance of profit about ${Math.round(opts.pop * 100)}%.`;
}
