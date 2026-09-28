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
import { computeMetrics, frontExpiration, netOpenPrice, type TradeMetrics } from '../strategies/metrics';
import { buildStructure, optionLegs, STRUCTURES } from '../strategies/structures';
import type { BuildParams, Leg, StructureId } from '../strategies/types';
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
      const credit = id === 'covered_call' ? ctx.spot - net : -net;
      return dte > 0 && ctx.spot > 0 && (credit / ctx.spot) * (365 / dte) >= rule.threshold;
    }
    case 'profitOverDebit':
      return net > 0 && m.maxProfit !== null && m.maxProfit >= rule.threshold * net;
  }
}

/**
 * The risk the cap is measured against. Defined-risk spreads: their max loss. Covered calls and
 * cash-secured puts can in theory lose nearly the whole collateral, so the cap uses a stress loss
 * (a drop of 3 expected moves, at least 25%) and the full collateral must still fit in equity.
 */
function riskFor(
  id: StructureId,
  m: TradeMetrics,
  spot: number,
  legs: Leg[],
  qty: number,
): { risk: Cents; collateral: Cents; maxLoss: Cents } {
  const maxLoss = contractCents(m.maxLoss, qty);
  if (id === 'cash_secured_put' || id === 'covered_call') {
    const emPct = m.expectedMove !== null && spot > 0 ? m.expectedMove / spot : 0.08;
    const drop = Math.max(0.25, 3 * emPct);
    const stressSpot = spot * (1 - drop);
    const k = optionLegs(legs)[0]?.strike ?? spot;
    const credit = id === 'covered_call' ? spot - m.entryNet : -m.entryNet;
    const stressLoss =
      id === 'cash_secured_put'
        ? Math.max(0, k - stressSpot - credit)
        : Math.max(0, spot - stressSpot - credit);
    const collateral =
      id === 'cash_secured_put' ? contractCents(k - credit, qty) : contractCents(spot - credit, qty);
    return { risk: contractCents(stressLoss, qty), collateral, maxLoss };
  }
  const collateral = m.entryNet > 0 ? contractCents(m.entryNet, qty) : maxLoss;
  return { risk: maxLoss, collateral: Math.max(collateral, maxLoss), maxLoss };
}

export function planTrade(i: PlanInput): TradePlan {
  if (i.qty < 1 || !Number.isInteger(i.qty)) return empty(i, 'Contracts must be a whole number, at least 1.');
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
  if (def.credit && metrics.entryNet >= 0 && i.structureId !== 'covered_call')
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
  const { risk, collateral, maxLoss } = riskFor(i.structureId, metrics, i.chain.spot, legs, i.qty);
  const riskCheck = checkRisk({
    maxLossCents: risk,
    collateralCents: collateral,
    equityCents: i.equityCents,
    riskCapPct: i.riskCapPct,
    reservedCents: i.reservedCents,
  });
  const edge = computeEdgeRank(i.structureId, legs, i.chain);
  const goodRR = dte !== null && meetsRR(i.structureId, metrics, i.ctx, dte);
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
  return {
    ok: riskCheck.ok,
    reason: riskCheck.ok ? null : riskCheck.reason,
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
