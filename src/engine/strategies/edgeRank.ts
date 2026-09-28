/**
 * Edge Rank: how good this trade's pay-for-risk is compared with every comparable spread on
 * the same chain that day (same structure and expiration, short strike |delta| within 0.05,
 * width within one strike increment). Jacob asked for a bonus when R:R is high *relative to the
 * rest of the chain*, which rewards shopping the chain instead of taking the default strike.
 */

import type { Chain } from '../market/types';
import { buildStructure, quotesFor, strikeStep } from './structures';
import { netOpenPrice, spreadWidth } from './metrics';
import type { Leg, OptionLeg, StructureId } from './types';

export interface EdgeRank {
  ratio: number;
  percentile: number; // share of comparables this trade beats or ties (1 = best on the chain)
  rank: number; // 1 = best
  of: number;
  tier: 'top10' | 'top25' | 'none';
}

export const EDGE_MIN_COMPARABLES = 5;

const shortLegs = (legs: Leg[]) => legs.filter((l): l is OptionLeg => l.kind === 'option' && l.ratio < 0);

/** Pay-for-risk used by the rank. Higher is better. Null when the structure has no fair comparison. */
export function edgeRatio(id: StructureId, legs: Leg[], chain: Chain): number | null {
  const net = netOpenPrice(legs, chain, 'mid');
  if (net === null) return null;
  const width = spreadWidth(legs);
  switch (id) {
    case 'bull_put':
    case 'bear_call':
    case 'iron_condor':
    case 'iron_fly':
    case 'bwb_condor':
      return width > 0 && net < 0 ? -net / width : null;
    case 'bull_call':
    case 'bear_put':
      return net > 0 && width > net ? (width - net) / net : null;
    case 'covered_call':
    case 'cash_secured_put': {
      const s = shortLegs(legs)[0];
      const credit = s ? -net + (id === 'covered_call' ? chain.spot : 0) : 0;
      return s && s.strike > 0 ? credit / s.strike : null;
    }
    default:
      return null;
  }
}

function deltaOf(chain: Chain, leg: OptionLeg): number | null {
  const q = chain.quotes.find(
    (x) => x.expiration === leg.expiration && x.right === leg.right && Math.abs(x.strike - leg.strike) < 1e-6,
  );
  return q ? Math.abs(q.delta) : null;
}

export function computeEdgeRank(id: StructureId, legs: Leg[], chain: Chain): EdgeRank | null {
  const mine = edgeRatio(id, legs, chain);
  if (mine === null) return null;
  const shorts = shortLegs(legs);
  if (shorts.length === 0) {
    // Debit verticals: the long leg's delta is the anchor.
    const longs = legs.filter((l): l is OptionLeg => l.kind === 'option' && l.ratio > 0);
    if (longs.length === 0) return null;
    shorts.push(longs[0]);
  }
  const exp = shorts[0].expiration;
  const anchorDelta = shorts.map((s) => deltaOf(chain, s) ?? 0).reduce((a, b) => a + b, 0) / shorts.length;
  const inc = strikeStep(chain, exp);
  const width = spreadWidth(legs);
  const right = shorts[0].right;
  const candidates = quotesFor(chain, exp, right).filter(
    (q) => Math.abs(Math.abs(q.delta) - anchorDelta) <= 0.05 + 1e-9,
  );
  const ratios: number[] = [];
  const widthSteps = [1, 2, 3, 4, 5, 6, 8, 10];
  for (const q of candidates) {
    for (const steps of widthSteps) {
      const built = buildStructure(id, chain, {
        expiration: exp,
        delta: Math.abs(q.delta),
        width: steps,
        anchor: id === 'iron_condor' || id === 'bwb_condor' ? undefined : q.strike,
      });
      if (!built.ok) continue;
      const w = spreadWidth(built.legs);
      if (width > 0 && Math.abs(w - width) > inc + 1e-9) continue;
      const r = edgeRatio(id, built.legs, chain);
      if (r !== null) ratios.push(r);
      if (width === 0) break; // income trades have no width to vary
    }
  }
  if (id === 'iron_condor' || id === 'bwb_condor') {
    // Condors vary both short deltas together; widen the comparable set by delta alone.
    for (const d of [-0.05, -0.03, -0.01, 0.01, 0.03, 0.05]) {
      for (const steps of widthSteps) {
        const built = buildStructure(id, chain, {
          expiration: exp,
          delta: Math.max(0.03, anchorDelta + d),
          width: steps,
        });
        if (!built.ok) continue;
        if (Math.abs(spreadWidth(built.legs) - width) > inc + 1e-9) continue;
        const r = edgeRatio(id, built.legs, chain);
        if (r !== null) ratios.push(r);
      }
    }
  }
  ratios.push(mine);
  const unique = ratios.length;
  if (unique < EDGE_MIN_COMPARABLES)
    return { ratio: mine, percentile: 0.5, rank: 1, of: unique, tier: 'none' };
  const better = ratios.filter((r) => r > mine + 1e-12).length;
  const beatsOrTies = ratios.filter((r) => r <= mine + 1e-12).length;
  const percentile = beatsOrTies / unique;
  const rank = better + 1;
  const topShare = rank / unique;
  const tier = topShare <= 0.1 ? 'top10' : topShare <= 0.25 ? 'top25' : 'none';
  return { ratio: mine, percentile, rank, of: unique, tier };
}
