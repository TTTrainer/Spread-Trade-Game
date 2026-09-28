import { describe, expect, it } from 'vitest';
import { computeEdgeRank, edgeRatio } from '../../src/engine/strategies/edgeRank';
import { computeMetrics, envFromChain, expectedMove, legsValue, netClosePrice, netOpenPrice, payoffAtExpiry, plainGreeks, probabilityOfProfit, spreadWidth } from '../../src/engine/strategies/metrics';
import { ALL_STRUCTURES, buildStructure, expirationsOf, findQuote, reverseOf, stepStrike, strikeByDelta, strikeStep, STRUCTURES } from '../../src/engine/strategies/structures';
import type { Leg, OptionLeg, StructureId } from '../../src/engine/strategies/types';
import { flatChain } from '../helpers/market';

const FRONT = '2025-01-31';
const BACK = '2025-02-28';
const chain = flatChain({ date: '2025-01-03', spot: 100, expirations: [FRONT, BACK] });

const legsOf = (id: StructureId, extra = {}) => {
  const r = buildStructure(id, chain, { expiration: FRONT, backExpiration: BACK, ...STRUCTURES[id].defaults, ...extra });
  if (!r.ok) throw new Error(`${id}: ${r.reason}`);
  return r.legs;
};

describe('structures', () => {
  it('build every structure on a real-looking chain', () => {
    for (const s of ALL_STRUCTURES) {
      const legs = legsOf(s.id);
      expect(legs.length).toBeGreaterThan(0);
      for (const l of legs) if (l.kind === 'option') expect(findQuote(chain, l)).toBeDefined();
    }
  });

  it('put the short strike of a credit spread near the target delta', () => {
    const legs = legsOf('bull_put') as OptionLeg[];
    const short = legs.find((l) => l.ratio < 0) as OptionLeg;
    const long = legs.find((l) => l.ratio > 0) as OptionLeg;
    expect(Math.abs((findQuote(chain, short)?.delta ?? 0) + 0.3)).toBeLessThan(0.05);
    expect(long.strike).toBe(short.strike - 2);
    const bc = legsOf('bear_call') as OptionLeg[];
    expect(bc.find((l) => l.ratio < 0)?.right).toBe('C');
    expect((bc.find((l) => l.ratio > 0) as OptionLeg).strike).toBeGreaterThan((bc.find((l) => l.ratio < 0) as OptionLeg).strike);
  });

  it('explain illegal builds in plain words', () => {
    const zero = buildStructure('bull_put', chain, { expiration: FRONT, delta: 0.3, width: 0 });
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.reason).toMatch(/Width/);
    const far = buildStructure('bull_put', chain, { expiration: FRONT, delta: 0.3, width: 200 });
    expect(far.ok).toBe(false);
    const noBack = buildStructure('calendar', chain, { expiration: FRONT, delta: 0.5, width: 0 });
    expect(noBack.ok).toBe(false);
    const overlap = buildStructure('iron_condor', chain, { expiration: FRONT, delta: 0.6, width: 1 });
    expect(overlap.ok).toBe(false);
  });

  it('reverse flips bull put and bear call', () => {
    expect(reverseOf('bull_put')).toBe('bear_call');
    expect(reverseOf('bear_call')).toBe('bull_put');
    expect(reverseOf('iron_condor')).toBe('iron_condor');
  });

  it('helpers find strikes', () => {
    expect(expirationsOf(chain)).toEqual([FRONT, BACK]);
    expect(stepStrike(chain, FRONT, 'P', 95, -2)).toBe(93);
    expect(stepStrike(chain, FRONT, 'P', 95.5, 1)).toBeNull();
    expect(stepStrike(chain, FRONT, 'P', 80, -1)).toBeNull();
    expect(strikeStep(chain, FRONT)).toBe(1);
    expect(strikeByDelta(chain, FRONT, 'C', 0.5)?.strike).toBeCloseTo(101, 0);
    const anchored = buildStructure('bull_put', chain, { expiration: FRONT, delta: 0.3, width: 3, anchor: 92.4 });
    expect(anchored.ok && (anchored.legs[0] as OptionLeg).strike).toBe(92);
  });
});

describe('payoff tables', () => {
  const env = envFromChain(chain, 0.03);
  const payoff = (legs: Leg[], net: number, s: number) => Math.round(payoffAtExpiry(legs, net, s, env) * 1e6) / 1e6;

  it('credit verticals', () => {
    const legs: Leg[] = [
      { kind: 'option', right: 'P', strike: 95, expiration: FRONT, ratio: -1 },
      { kind: 'option', right: 'P', strike: 90, expiration: FRONT, ratio: 1 },
    ];
    const net = -1.5; // collected 1.50 on a 5-wide
    expect(payoff(legs, net, 120)).toBe(1.5);
    expect(payoff(legs, net, 95)).toBe(1.5);
    expect(payoff(legs, net, 93.5)).toBe(0);
    expect(payoff(legs, net, 92)).toBe(-1.5);
    expect(payoff(legs, net, 80)).toBe(-3.5);
    const m = computeMetrics(legs, chain, STRUCTURES.bull_put, 0.03, 0, net);
    expect(m?.maxProfit).toBeCloseTo(1.5, 9);
    expect(m?.maxLoss).toBeCloseTo(3.5, 9);
    expect(m?.breakevens).toEqual([93.5]);
    expect(m?.rewardToRisk).toBeCloseTo(1.5 / 3.5, 9);
    expect(m?.width).toBe(5);
  });

  it('debit verticals', () => {
    const legs: Leg[] = [
      { kind: 'option', right: 'C', strike: 100, expiration: FRONT, ratio: 1 },
      { kind: 'option', right: 'C', strike: 105, expiration: FRONT, ratio: -1 },
    ];
    expect(payoff(legs, 2, 90)).toBe(-2);
    expect(payoff(legs, 2, 102)).toBe(0);
    expect(payoff(legs, 2, 110)).toBe(3);
    const m = computeMetrics(legs, chain, STRUCTURES.bull_call, 0.03, 0, 2);
    expect(m?.maxProfit).toBeCloseTo(3, 9);
    expect(m?.maxLoss).toBeCloseTo(2, 9);
  });

  it('iron condor, fly, straddle, strangle', () => {
    const ic: Leg[] = [
      { kind: 'option', right: 'P', strike: 90, expiration: FRONT, ratio: 1 },
      { kind: 'option', right: 'P', strike: 95, expiration: FRONT, ratio: -1 },
      { kind: 'option', right: 'C', strike: 105, expiration: FRONT, ratio: -1 },
      { kind: 'option', right: 'C', strike: 110, expiration: FRONT, ratio: 1 },
    ];
    expect(payoff(ic, -2, 100)).toBe(2);
    expect(payoff(ic, -2, 85)).toBe(-3);
    expect(payoff(ic, -2, 115)).toBe(-3);
    const m = computeMetrics(ic, chain, STRUCTURES.iron_condor, 0.03, 0, -2);
    expect(m?.breakevens).toEqual([93, 107]);
    const straddle: Leg[] = [
      { kind: 'option', right: 'C', strike: 100, expiration: FRONT, ratio: 1 },
      { kind: 'option', right: 'P', strike: 100, expiration: FRONT, ratio: 1 },
    ];
    expect(payoff(straddle, 6, 100)).toBe(-6);
    expect(payoff(straddle, 6, 110)).toBe(4);
    expect(payoff(straddle, 6, 88)).toBe(6);
    const sm = computeMetrics(straddle, chain, STRUCTURES.long_straddle, 0.03, 0, 6);
    expect(sm?.maxProfit).toBeNull();
    expect(sm?.maxLoss).toBeCloseTo(6, 9);
    expect(sm?.breakevens).toEqual([94, 106]);
  });

  it('covered call and cash-secured put', () => {
    const cc: Leg[] = [
      { kind: 'stock', ratio: 1 },
      { kind: 'option', right: 'C', strike: 105, expiration: FRONT, ratio: -1 },
    ];
    // Bought stock at 100, sold the call for 1.
    expect(payoff(cc, 99, 110)).toBe(6);
    expect(payoff(cc, 99, 99)).toBe(0);
    const m = computeMetrics(cc, chain, STRUCTURES.covered_call, 0.03, 0, 99);
    expect(m?.maxProfit).toBeCloseTo(6, 9);
    expect(m?.maxLoss).toBeGreaterThan(98);
    const csp: Leg[] = [{ kind: 'option', right: 'P', strike: 95, expiration: FRONT, ratio: -1 }];
    expect(payoff(csp, -1.2, 100)).toBe(1.2);
    expect(payoff(csp, -1.2, 90)).toBe(-3.8);
  });

  it('calendars value the back month with its IV at the front expiration', () => {
    const cal = legsOf('calendar');
    const net = netOpenPrice(cal, chain, 'mid') as number;
    expect(net).toBeGreaterThan(0);
    const atStrike = payoffAtExpiry(cal, net, (cal[0] as OptionLeg).strike, env);
    const farAway = payoffAtExpiry(cal, net, 70, env);
    expect(atStrike).toBeGreaterThan(0);
    expect(farAway).toBeLessThan(0);
    const m = computeMetrics(cal, chain, STRUCTURES.calendar, 0.03, 0);
    expect(m?.maxLoss).toBeLessThanOrEqual(net + 1e-6);
    expect(m?.breakevens.length).toBe(2);
    expect(legsValue(cal, 100, '2025-03-10', env)).toBeCloseTo(0, 9); // everything expired OTM/ATM at 100
  });
});

describe('pricing spreads from legs', () => {
  it('nets natural and mid prices', () => {
    const legs = legsOf('bull_put');
    const mid = netOpenPrice(legs, chain, 'mid') as number;
    const nat = netOpenPrice(legs, chain, 'natural') as number;
    expect(mid).toBeLessThan(0);
    // Two legs, each about 0.05 of half spread against you (quotes round out to pennies).
    expect(nat - mid).toBeGreaterThan(0.09);
    expect(nat - mid).toBeLessThan(0.13);
    const closeNat = netClosePrice(legs, chain, 'natural') as number;
    expect(mid - closeNat).toBeGreaterThan(0.09);
    expect(mid - closeNat).toBeLessThan(0.13);
    expect(netOpenPrice([{ kind: 'option', right: 'P', strike: 1, expiration: FRONT, ratio: 1 }], chain, 'mid')).toBeNull();
    expect(netClosePrice([{ kind: 'option', right: 'P', strike: 1, expiration: FRONT, ratio: 1 }], chain, 'mid')).toBeNull();
    expect(spreadWidth(legs)).toBe(2);
    expect(expectedMove(chain, FRONT)).toBeGreaterThan(4);
    expect(expectedMove(chain, '2030-01-01')).toBeNull();
  });

  it('probability of profit is sane', () => {
    const env = envFromChain(chain, 0.03);
    const legs = legsOf('bull_put');
    const net = netOpenPrice(legs, chain, 'mid') as number;
    const pop = probabilityOfProfit(legs, net, env, 100, 0.3);
    expect(pop).toBeGreaterThan(0.65);
    expect(pop).toBeLessThan(0.85);
    const straddle = legsOf('long_straddle');
    const spop = probabilityOfProfit(straddle, netOpenPrice(straddle, chain, 'mid') as number, env, 100, 0.3);
    expect(spop).toBeGreaterThan(0.2);
    expect(spop).toBeLessThan(0.5);
  });

  it('writes Greeks in plain English', () => {
    const m = computeMetrics(legsOf('bull_put'), chain, STRUCTURES.bull_put, 0.03);
    const lines = plainGreeks(m?.greeks ?? { delta: 0, gamma: 0, theta: 0, vega: 0 }, 2);
    expect(lines[0]).toMatch(/You make about \$\d+ a day from time decay/);
    expect(lines[1]).toMatch(/If the stock rises \$1, you make about/);
    expect(lines[2]).toMatch(/drops 1 point, you make/);
    expect(plainGreeks({ delta: 0, gamma: 0, theta: 0, vega: 0 }, 1)[0]).toMatch(/barely/);
    expect(plainGreeks({ delta: -30, gamma: 0.5, theta: -3, vega: 8 }, 1).join(' ')).toMatch(/costs you.*lose.*lose.*help/);
  });
});

describe('Edge Rank', () => {
  it('ranks a trade against comparable spreads on the same chain', () => {
    const legs = legsOf('bull_put');
    const er = computeEdgeRank('bull_put', legs, chain);
    expect(er).not.toBeNull();
    expect(er?.of).toBeGreaterThanOrEqual(5);
    expect(er?.percentile).toBeGreaterThan(0);
    expect(er?.percentile).toBeLessThanOrEqual(1);
  });

  it('gives the best-paying comparable the top tier', () => {
    // On a flat-vol chain, a closer short strike collects more credit per dollar of width.
    const legs = legsOf('bull_put', { delta: 0.35 });
    const er = computeEdgeRank('bull_put', legs, chain);
    const worse = computeEdgeRank('bull_put', legsOf('bull_put', { delta: 0.25 }), chain);
    expect((er?.ratio ?? 0) > (worse?.ratio ?? 1)).toBe(true);
  });

  it('computes ratios for each supported family and skips the rest', () => {
    expect(edgeRatio('bull_call', legsOf('bull_call'), chain)).toBeGreaterThan(0);
    expect(edgeRatio('iron_condor', legsOf('iron_condor'), chain)).toBeGreaterThan(0);
    expect(edgeRatio('cash_secured_put', legsOf('cash_secured_put'), chain)).toBeGreaterThan(0);
    expect(edgeRatio('covered_call', legsOf('covered_call'), chain)).toBeGreaterThan(0);
    expect(edgeRatio('long_straddle', legsOf('long_straddle'), chain)).toBeNull();
    expect(computeEdgeRank('calendar', legsOf('calendar'), chain)).toBeNull();
    expect(computeEdgeRank('iron_condor', legsOf('iron_condor'), chain)?.of).toBeGreaterThanOrEqual(5);
    expect(computeEdgeRank('bull_call', legsOf('bull_call'), chain)).not.toBeNull();
    expect(computeEdgeRank('cash_secured_put', legsOf('cash_secured_put'), chain)).not.toBeNull();
  });
});
