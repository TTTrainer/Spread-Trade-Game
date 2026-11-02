/**
 * planTrade: everything the builder shows and the order needs, from one call. Legs snapped to
 * real strikes, live metrics, Edge Rank, the R:R rule, risk against the cap, collateral, and the
 * entry snapshot the debrief and scoring use later. Used by the UI, the bots and the tests.
 */

import { diffDays, type ISODate } from '../calendar';
import type { MarketContext } from '../market/context';
import type { Chain } from '../market/types';
import { contractCents, type Cents } from '../money';
import { checkRisk, type RiskCheck } from '../orders/rules';
import { computeEdgeRank, type EdgeRank } from '../strategies/edgeRank';
import {
  atmIv,
  computeMetrics,
  envFromChain,
  expectedOutcome,
  frontExpiration,
  netOpenPrice,
  type ExpectedOutcome,
  type TradeMetrics,
} from '../strategies/metrics';
import { buildStructure, optionLegs, STRUCTURES } from '../strategies/structures';
import type { BuildParams, Leg, StructureId } from '../strategies/types';
import { BALANCE } from '../../content/balance';
import { RR_RULES } from '../../content/structureRules';
import type { EntrySnapshot } from '../lifecycle/types';

export interface PlanInput {
  structureId: StructureId;
  params: BuildParams;
  chain: Chain;
  qty: number;
  ctx: MarketContext;
  equityCents: Cents;
  riskCapPct: number;
  reservedCents: Cents;
  rate: number;
  /** Override legs (player dragged handles on the ladder). */
  legs?: Leg[];
  /** A covered call's automatic stop, as a multiple of its premium (desk default when absent). */
  stopMult?: number;
}

export interface TradePlan {
  ok: boolean;
  reason: string | null;
  structureId: StructureId;
  legs: Leg[];
  qty: number;
  metrics: TradeMetrics | null;
  edge: EdgeRank | null;
  mid: number | null;
  natural: number | null;
  maxLossCents: Cents;
  maxProfitCents: Cents | null;
  riskCents: Cents;
  collateralCents: Cents;
  riskPct: number;
  risk: RiskCheck | null;
  goodRR: boolean;
  /** Probability-weighted gain, loss and expected value (the honest risk:reward). */
  outcome: ExpectedOutcome | null;
  expiration: ISODate | null;
  dte: number | null;
  entry: EntrySnapshot | null;
}

const empty = (i: PlanInput, reason: string): TradePlan => ({
  ok: false,
  reason,
  structureId: i.structureId,
  legs: [],
  qty: i.qty,
  metrics: null,
  edge: null,
  mid: null,
  natural: null,
  maxLossCents: 0,
  maxProfitCents: null,
  riskCents: 0,
  collateralCents: 0,
  riskPct: 0,
  risk: null,
  goodRR: false,
  outcome: null,
  expiration: null,
  dte: null,
  entry: null,
});

export function meetsRR(id: StructureId, m: TradeMetrics, ctx: MarketContext, dte: number): boolean {
  const rule = RR_RULES[id];
  const net = m.entryNet;
  switch (rule.kind) {
    case 'creditOfWidth':
      return net < 0 && m.width > 0 && -net / m.width >= rule.threshold - 1e-9;
    case 'debitOfWidth':
      return net > 0 && m.width > 0 && net / m.width <= rule.threshold + 1e-9;
    case 'ivrAtMost':
      return ctx.ivr !== null && ctx.ivr <= rule.threshold;
    case 'annualYield': {
      const credit = -net;
      return dte > 0 && ctx.spot > 0 && (credit / ctx.spot) * (365 / dte) >= rule.threshold;
    }
    case 'profitOverDebit':
      return net > 0 && m.maxProfit !== null && m.maxProfit >= rule.threshold * net;
  }
}

/** Covered calls are sold against 500 shares you're assumed to own: at most 5 contracts. */
export const COVERED_SHARES = 500;

/** The most contracts a structure allows (covered calls: one per 100 of your shares). */
export function maxQtyFor(structureId: StructureId): number {
  return structureId === 'covered_call' ? COVERED_SHARES / 100 : Number.POSITIVE_INFINITY;
}

/** A covered call's stop multiple, kept in a sane range. */
export function coveredStopMult(stopMult: number | null | undefined): number {
  const c = BALANCE.coveredCall;
  return Math.max(c.minStopMult, stopMult ?? c.stopMult);
}

/**
 * The risk the cap is measured against. Defined-risk spreads: their max loss. A cash-secured put
 * can lose nearly all its collateral in theory, so the cap uses a stress loss (a drop of 3
 * expected moves, at least 25%) and the full collateral must still fit in equity. A covered call
 * is the call alone (the shares are yours already, off the books) and always carries an automatic
 * stop, so its risk is the loss at that stop plus a gap allowance, and it needs no cash.
 */
function riskFor(
  id: StructureId,
  m: TradeMetrics,
  spot: number,
  legs: Leg[],
  qty: number,
  stopMult?: number,
): { risk: Cents; collateral: Cents; maxLoss: Cents } {
  const maxLoss = contractCents(m.maxLoss, qty);
  if (id === 'cash_secured_put' || id === 'covered_call') {
    const emPct = m.expectedMove !== null && spot > 0 ? m.expectedMove / spot : 0.08;
    const move = Math.max(0.25, 3 * emPct);
    const k = optionLegs(legs)[0]?.strike ?? spot;
    const credit = -m.entryNet;
    if (id === 'covered_call') {
      const atStop = credit * coveredStopMult(stopMult) * (1 + BALANCE.coveredCall.gapAllowance);
      const risk = contractCents(Math.max(0, atStop), qty);
      return { risk, collateral: 0, maxLoss: risk };
    }
    const stressLoss = Math.max(0, k - spot * (1 - move) - credit);
    return { risk: contractCents(stressLoss, qty), collateral: contractCents(k - credit, qty), maxLoss };
  }
  const collateral = m.entryNet > 0 ? contractCents(m.entryNet, qty) : maxLoss;
  return { risk: maxLoss, collateral: Math.max(collateral, maxLoss), maxLoss };
}

export function planTrade(i: PlanInput): TradePlan {
  if (i.qty < 1 || !Number.isInteger(i.qty)) return empty(i, 'Contracts must be a whole number, at least 1.');
  if (i.structureId === 'covered_call' && i.qty * 100 > COVERED_SHARES)
    return empty(
      i,
      `You own ${COVERED_SHARES} shares of each stock: at most ${COVERED_SHARES / 100} covered calls (100 shares each).`,
    );
  let legs: Leg[];
  if (i.legs) legs = i.legs;
  else {
    const built = buildStructure(i.structureId, i.chain, i.params);
    if (!built.ok) return empty(i, built.reason);
    legs = built.legs;
  }
  const mid = netOpenPrice(legs, i.chain, 'mid');
  const natural = netOpenPrice(legs, i.chain, 'natural');
  if (mid === null || natural === null) return { ...empty(i, 'One of the legs has no quote today.'), legs };
  const def = STRUCTURES[i.structureId];
  const metrics = computeMetrics(legs, i.chain, def, i.rate, i.ctx.divYield, mid);
  if (!metrics) return { ...empty(i, 'One of the legs has no quote today.'), legs };
  if (def.credit && metrics.entryNet >= 0)
    return {
      ...empty(i, 'This build collects no credit at mid. Move the short strike closer or widen.'),
      legs,
    };
  if (
    metrics.width === 0 &&
    ['bull_put', 'bear_call', 'bull_call', 'bear_put', 'iron_condor', 'iron_fly', 'bwb_condor'].includes(
      i.structureId,
    )
  )
    return { ...empty(i, 'Width is zero. Pick two different strikes.'), legs };
  const exp = frontExpiration(legs);
  const dte = exp ? diffDays(i.chain.date, exp) : null;
  const { risk, collateral, maxLoss } = riskFor(
    i.structureId,
    metrics,
    i.chain.spot,
    legs,
    i.qty,
    i.stopMult,
  );
  const riskCheck = checkRisk({
    maxLossCents: risk,
    collateralCents: collateral,
    equityCents: i.equityCents,
    riskCapPct: i.riskCapPct,
    reservedCents: i.reservedCents,
  });
  const edge = computeEdgeRank(i.structureId, legs, i.chain);
  const goodRR = dte !== null && meetsRR(i.structureId, metrics, i.ctx, dte);
  // Weigh outcomes by how much the stock has actually been moving (20-day realized volatility).
  // With the options' own IV every fairly priced trade would come out about even, which hides
  // exactly what a premium seller needs to see: whether the premium beats the real movement.
  const realized = i.ctx.hv20 !== null && i.ctx.hv20 > 0.02;
  const sigma = realized
    ? (i.ctx.hv20 as number)
    : (atmIv(i.chain, exp ?? i.chain.date) ?? i.ctx.iv30 ?? 0.3);
  const outcome =
    mid !== null
      ? expectedOutcome(
          legs,
          mid,
          envFromChain(i.chain, i.rate, i.ctx.divYield),
          i.chain.spot,
          sigma,
          realized ? 'realized' : 'implied',
          metrics.maxLoss,
        )
      : null;
  const shortStrikes = optionLegs(legs)
    .filter((l) => l.ratio < 0)
    .map((l) => l.strike);
  const expDate = exp ?? i.chain.date;
  const entry: EntrySnapshot = {
    spot: i.chain.spot,
    ivr: i.ctx.ivr,
    iv: i.ctx.iv30 ?? 0,
    hv20: i.ctx.hv20,
    expectedMove: metrics.expectedMove,
    expectedMovePct: metrics.expectedMove !== null ? metrics.expectedMove / i.chain.spot : null,
    edgePercentile: edge ? edge.percentile : null,
    edgeTier: edge ? edge.tier : null,
    rewardToRisk: metrics.rewardToRisk,
    pop: metrics.pop,
    maxProfitCents: metrics.maxProfit === null ? null : contractCents(metrics.maxProfit, i.qty),
    maxLossCents: maxLoss,
    riskPct: riskCheck.riskPct,
    shortStrikes,
    dte: dte ?? 0,
    earningsInside: !!i.ctx.nextEarnings && i.ctx.nextEarnings.reactionDate <= expDate,
    exDivInside: !!i.ctx.nextExDiv && i.ctx.nextExDiv.exDate <= expDate,
    rsi: i.ctx.rsi,
    trendSlope: i.ctx.sma50Slope,
    sma50Slope: i.ctx.sma50Slope,
    macdCrossDaysAgo: i.ctx.macdCrossDaysAgo,
    macdCrossDir: i.ctx.macdCrossDir,
    bollingerUpper: i.ctx.bollingerUpper,
    bollingerLower: i.ctx.bollingerLower,
    trend5d: i.ctx.trend5d,
    ivVsHv: i.ctx.iv30 !== null && i.ctx.hv20 !== null ? (i.ctx.iv30 - i.ctx.hv20) * 100 : null,
    atr: i.ctx.atr,
    credit: metrics.entryNet < 0,
    fillVsMidCents: 0,
    goodRR,
  };
  // A covered call has no width to narrow: its lever is the stop (or a further, nearer-dated call).
  const reason = riskCheck.ok
    ? null
    : i.structureId === 'covered_call' && riskCheck.reason.startsWith('Max loss')
      ? `Risk at the automatic stop is ${(riskCheck.riskPct * 100).toFixed(1)}% of equity; the cap is ${(i.riskCapPct * 100).toFixed(1)}%. Tighten the auto stop, sell a further strike or a nearer expiration, or use fewer contracts.`
      : riskCheck.reason;
  return {
    ok: riskCheck.ok,
    reason,
    structureId: i.structureId,
    legs,
    qty: i.qty,
    metrics,
    edge,
    mid,
    natural,
    maxLossCents: maxLoss,
    maxProfitCents: entry.maxProfitCents,
    riskCents: risk,
    collateralCents: collateral,
    riskPct: riskCheck.riskPct,
    risk: riskCheck,
    goodRR,
    outcome,
    expiration: exp,
    dte,
    entry,
  };
}

/** Largest whole number of contracts that fits the risk cap and buying power. */
export function maxContracts(
  plan1: TradePlan,
  equityCents: Cents,
  riskCapPct: number,
  reservedCents: Cents,
): number {
  if (!plan1.metrics || plan1.qty !== 1) return 0;
  const byRisk = plan1.riskCents > 0 ? Math.floor((equityCents * riskCapPct) / plan1.riskCents) : 0;
  const byBp =
    plan1.collateralCents > 0 ? Math.floor((equityCents - reservedCents) / plan1.collateralCents) : 0;
  return Math.max(0, Math.min(byRisk, byBp));
}

/**
 * The premium a build collects per share at a given net price, or null when it pays a debit. A
 * covered call's net is a debit because it buys the shares, yet it is a premium sale: only its
 * option legs count, so the ticket says SELL and the take-profit and stop are sized on the premium.
 */
export function premiumOf(net: number | null, legs: Leg[], spot: number | null | undefined): number | null {
  if (net === null) return null;
  if (net < 0) return -net;
  const shares = legs.reduce((a, l) => a + (l.kind === 'stock' ? l.ratio : 0), 0);
  if (!shares || spot === null || spot === undefined) return null;
  const optionNet = net - shares * spot;
  return optionNet < 0 ? -optionNet : null;
}
