/**
 * Debrief alternates: what shares, a long ATM call or put, a debit spread, a 30-delta credit
 * spread and a 16-delta iron condor would have returned over the same dates on the same chain.
 * Entries at the natural price on the entry chain, exits at the natural price on the exit day.
 */

import { contractCents, type Cents } from '../money';
import type { Chain, ContractKey, OptionQuote } from '../market/types';
import { buildStructure, nearestStrike } from '../strategies/structures';
import { netOpenPrice } from '../strategies/metrics';
import type { Leg, OptionLeg } from '../strategies/types';

export interface AlternateSpec {
  id: 'shares' | 'long_option' | 'debit_spread' | 'credit_spread' | 'condor16';
  label: string;
  legs: Leg[];
}

export interface AlternateResult {
  id: AlternateSpec['id'];
  label: string;
  plCents: Cents;
  riskCents: Cents;
  returnPct: number;
}

export function alternateSpecs(entry: Chain, expiration: string, bullish: boolean): AlternateSpec[] {
  const out: AlternateSpec[] = [{ id: 'shares', label: bullish ? '100 shares long' : '100 shares short', legs: [{ kind: 'stock', ratio: bullish ? 1 : -1 }] }];
  const atm = nearestStrike(entry, expiration, bullish ? 'C' : 'P', entry.spot);
  if (atm) out.push({ id: 'long_option', label: bullish ? 'Long ATM call' : 'Long ATM put', legs: [{ kind: 'option', right: bullish ? 'C' : 'P', strike: atm.strike, expiration, ratio: 1 }] });
  const debit = buildStructure(bullish ? 'bull_call' : 'bear_put', entry, { expiration, delta: 0.5, width: 2 });
  if (debit.ok) out.push({ id: 'debit_spread', label: bullish ? 'Bull call debit spread' : 'Bear put debit spread', legs: debit.legs });
  const credit = buildStructure(bullish ? 'bull_put' : 'bear_call', entry, { expiration, delta: 0.3, width: 2 });
  if (credit.ok) out.push({ id: 'credit_spread', label: bullish ? '30Δ bull put spread' : '30Δ bear call spread', legs: credit.legs });
  const condor = buildStructure('iron_condor', entry, { expiration, delta: 0.16, width: 2 });
  if (condor.ok) out.push({ id: 'condor16', label: '16Δ iron condor', legs: condor.legs });
  return out;
}

export function alternateKeys(specs: AlternateSpec[]): ContractKey[] {
  const keys: ContractKey[] = [];
  for (const s of specs) for (const l of s.legs) if (l.kind === 'option') keys.push({ expiration: l.expiration, strike: l.strike, right: l.right });
  return keys;
}

/** Value each alternate for one unit, given the exit day's spot and quotes. */
export function valueAlternates(specs: AlternateSpec[], entry: Chain, exitSpot: number, exitQuote: (k: ContractKey) => OptionQuote | null, exitAfterExpiry: boolean): AlternateResult[] {
  const out: AlternateResult[] = [];
  for (const s of specs) {
    const open = netOpenPrice(s.legs, entry, 'natural');
    if (open === null) continue;
    let close = 0;
    for (const l of s.legs) {
      if (l.kind === 'stock') {
        close += l.ratio * exitSpot;
        continue;
      }
      const leg = l as OptionLeg;
      const q = exitAfterExpiry ? null : exitQuote(leg);
      if (q) close += leg.ratio * (leg.ratio > 0 ? q.bid : q.ask);
      else {
        // Expired (or unquoted) legs are worth their intrinsic value.
        const intrinsic = leg.right === 'C' ? Math.max(0, exitSpot - leg.strike) : Math.max(0, leg.strike - exitSpot);
        close += leg.ratio * intrinsic;
      }
    }
    const pl = close - open;
    const risk = s.id === 'shares' ? entry.spot : open > 0 ? open : riskOfCredit(s.legs, open);
    const plCents = contractCents(pl, 1);
    const riskCents = contractCents(risk, 1);
    out.push({ id: s.id, label: s.label, plCents, riskCents, returnPct: riskCents > 0 ? plCents / riskCents : 0 });
  }
  return out;
}

function riskOfCredit(legs: Leg[], open: number): number {
  const opts = legs.filter((l): l is OptionLeg => l.kind === 'option');
  let width = 0;
  for (const right of ['P', 'C'] as const) {
    const side = opts.filter((l) => l.right === right).map((l) => l.strike);
    if (side.length >= 2) width = Math.max(width, Math.max(...side) - Math.min(...side));
  }
  return Math.max(0.01, width + open);
}

/** SPY buy-and-hold over the trade's dates with the same capital at risk. */
export function benchmarkCents(capitalAtRisk: Cents, benchEntry: number, benchExit: number): Cents {
  if (benchEntry <= 0) return 0;
  return Math.round(capitalAtRisk * (benchExit / benchEntry - 1));
}
