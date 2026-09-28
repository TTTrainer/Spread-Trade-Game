import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/content/balance';
import { CARTRIDGES, CARTRIDGE_BY_ID } from '../../src/content/cartridges';
import { DESKS } from '../../src/content/desks';
import { emptyFamilies, familyPassives } from '../../src/content/families';
import { ANALYSTS } from '../../src/content/analysts';
import { REVIEWS, QUARTER_REVIEWS } from '../../src/content/reviews';
import type { TradeFacts } from '../../src/content/types';
import { computeTarget, initialState } from '../../src/engine/run/engine';
import { scoreSteps, type PipelineInput } from '../../src/engine/run/score';
import {
  cartridgePool,
  cartridgePrice,
  generateShop,
  interestFor,
  pickCartridge,
  rerollCost,
  sellPrice,
} from '../../src/engine/run/shop';
import { dealWindows } from '../../src/engine/run/deal';
import { baseRate, skew25, termStructure } from '../../src/engine/run/analystTools';
import type { RunConfig } from '../../src/engine/run/types';
import { runScore } from '../../src/engine/scoring/mult';
import { Rng } from '../../src/engine/rng';
import { DEFAULT_REALISM, defaultPause } from '../../src/engine/lifecycle/daily';
import type { WindowDef } from '../../src/engine/market/types';

const cfg: RunConfig = {
  seed: 'u',
  deskId: 'verticals',
  mode: 'career',
  tier: 0,
  startEquityCents: 500_000,
  pureMarket: false,
  realism: { ...DEFAULT_REALISM },
  pause: defaultPause(),
  callMode: 'em',
  rescale: true,
  quarters: 4,
  benchmark: null,
  startingStress: 0,
  extraRerolls: 0,
  practice: false,
};

function facts(over: Partial<TradeFacts> = {}): TradeFacts {
  return {
    positionId: 'p1',
    cardId: 'c1',
    structureId: 'bull_put',
    family: 'vertical',
    bias: 'bull',
    win: true,
    realizedCents: 10_000, // +2% of $5,000 = 200 chips
    riskPct: 0.05,
    shortPremium: true,
    credit: true,
    creditOfWidth: 0.34,
    pctOfMaxProfit: 0.6,
    closedAtPlan: null,
    exitReason: 'manual',
    expiredWorthless: false,
    dteAtEntry: 30,
    dteAtClose: 15,
    daysOpen: 10,
    daysInProfit: 6,
    heldOverWeekend: true,
    ivrAtEntry: 40,
    ivChangePct: -0.1,
    ivMinusHvAtEntry: 2,
    heldThroughEarnings: false,
    moveVsEm: 0.3,
    stayedInsideEm: true,
    rsiAtEntry: 50,
    shortOutsideBollinger: false,
    macdCrossWithin2: false,
    trendAligned: true,
    counterTrend: false,
    against5dTrend: false,
    callExact: false,
    callAdjacent: false,
    callDirectionRight: false,
    callBucket: 3,
    callActual: 2,
    callBigBucket: false,
    callFlat: false,
    rollsForCredit: 0,
    closedDayAfterMacro: false,
    eventDayWin: false,
    assigned: false,
    cspAssigned: false,
    coveredCallDividend: false,
    coveredCallExpiredOtm: false,
    pinnedFly: false,
    straddleBeatEm: false,
    condorOutsideEm: false,
    gappedThroughShort: false,
    earningsMoveRatio: null,
    highIv: false,
    portfolioDeltaAtClose: 0,
    frontIvAboveBack: null,
    isDoubleCalendar: false,
    diagonalWithTrend: false,
    thetaChips: 0,
    callBonus: 0,
    stopDeclined: false,
    lossWithinStop: false,
    dividendsCollected: 0,
    longPremiumThroughEvent: false,
    debitDirectional: false,
    ivCrushWin: false,
    straddlesBefore: 0,
    isStraddle: false,
    shortDte: 15,
    ...over,
  };
}

function pipe(over: Partial<PipelineInput> = {}): PipelineInput {
  return {
    facts: facts(),
    deskId: 'verticals',
    level: 1,
    goodRR: false,
    edgeTier: null,
    reviewId: null,
    families: emptyFamilies(),
    cartridges: [],
    cartState: {},
    run: {
      quarter: 1,
      roundIndex: 0,
      reviewId: null,
      deskId: 'verticals',
      families: emptyFamilies(),
      ownedCartridges: [],
      patienceStacks: 0,
      rollArtistStacks: 0,
      deltaNeutralOk: true,
      gapInsuranceUsed: false,
      ghostScore: 100,
    },
    doubleDown: false,
    hedge: false,
    ...over,
  };
}

describe('round targets', () => {
  it('follows 150/250/400, x1.6 a quarter, Annual x1.25, tiers', () => {
    expect([0, 1, 2].map((i) => computeTarget(1, i, null, cfg))).toEqual([150, 250, 400]);
    expect([0, 1, 2].map((i) => computeTarget(2, i, null, cfg))).toEqual([240, 400, 640]);
    expect(computeTarget(4, 2, 'annual_review', cfg)).toBe(Math.round((400 * 1.6 ** 3 * 1.25) / 10) * 10);
    expect(computeTarget(1, 0, null, { tier: 5 })).toBe(Math.round((150 * 1.25) / 10) * 10);
  });
});

describe('scoring pipeline', () => {
  it('adds structure base and the Verticals passive, then multiplies', () => {
    const steps = scoreSteps(pipe());
    const r = runScore(10_000, 500_000, steps);
    // 200 P/L chips + 30 base; mult 1 + 1 (Verticals: closed at 60% of max profit).
    expect(r.chips).toBeCloseTo(230);
    expect(r.mult).toBeCloseTo(2);
    expect(r.points).toBe(460);
  });

  it('applies Edge Rank after every additive source and cartridges in slot order', () => {
    const base = pipe({
      edgeTier: 'top10',
      goodRR: true,
      cartridges: ['credit_where_due', 'iv_crusher'],
      facts: facts({ ivrAtEntry: 60, ivChangePct: -0.3 }),
    });
    const labels = scoreSteps(base).map((s) => s.label);
    expect(labels.indexOf('Good R:R')).toBeLessThan(labels.indexOf('Edge Rank top 10%'));
    expect(labels.indexOf('Edge Rank top 10%')).toBeLessThan(labels.indexOf('Credit Where Due'));
    const a = runScore(10_000, 500_000, scoreSteps(base));
    const b = runScore(
      10_000,
      500_000,
      scoreSteps({ ...base, cartridges: ['iv_crusher', 'credit_where_due'] }),
    );
    // (1 + 1 + 1) x 1.5 = 4.5, + 2 = 6.5, x 1.5 = 9.75  vs  4.5 x 1.5 = 6.75, + 2 = 8.75.
    expect(a.mult).toBeCloseTo(9.75);
    expect(b.mult).toBeCloseTo(8.75);
  });

  it('never multiplies losers; only meter effects soften or amplify them', () => {
    const loser = facts({ win: false, realizedCents: -10_000, lossWithinStop: true, closedAtPlan: 'stop' });
    const plain = runScore(
      -10_000,
      500_000,
      scoreSteps(pipe({ facts: loser, edgeTier: 'top10', goodRR: true })),
    );
    expect(plain.points).toBe(-200);
    const refund = runScore(
      -10_000,
      500_000,
      scoreSteps(pipe({ facts: loser, cartridges: ['stop_discipline'] })),
    );
    expect(refund.points).toBe(-140);
    const lev = runScore(
      -10_000,
      500_000,
      scoreSteps(pipe({ facts: loser, cartridges: ['two_x_leverage'] })),
    );
    expect(lev.points).toBe(-400);
    const hedge = runScore(-10_000, 500_000, scoreSteps(pipe({ facts: loser, hedge: true })));
    expect(hedge.points).toBe(-100);
  });

  it('call bonus: exact at 90% adds +2.5; Earnings Gauntlet multiplies it by 1.5', () => {
    const f = facts({ callExact: true, callBonus: 2.5 });
    const r = runScore(10_000, 500_000, scoreSteps(pipe({ facts: f })));
    expect(r.mult).toBeCloseTo(1 + 2.5 + 1);
    const g = runScore(10_000, 500_000, scoreSteps(pipe({ facts: f, reviewId: 'earnings_gauntlet' })));
    expect(g.mult).toBeCloseTo(1 + 3.75 + 1);
  });

  it('Reviews: Dead Calm halves base chips, The Chop halves debit directional wins', () => {
    const dc = runScore(10_000, 500_000, scoreSteps(pipe({ reviewId: 'dead_calm' })));
    expect(dc.chips).toBeCloseTo(215);
    const debit = facts({
      structureId: 'bull_call',
      credit: false,
      shortPremium: false,
      debitDirectional: true,
      creditOfWidth: null,
    });
    const chop = runScore(10_000, 500_000, scoreSteps(pipe({ facts: debit, reviewId: 'the_chop' })));
    const calm = runScore(10_000, 500_000, scoreSteps(pipe({ facts: debit })));
    expect(chop.points).toBe(Math.round(calm.points * 0.5));
  });

  it('family bonuses switch on at 2, 3 and 4', () => {
    const f = facts({ thetaChips: 40 });
    const fam = { ...emptyFamilies(), THETA: 4 };
    const r = runScore(10_000, 500_000, scoreSteps(pipe({ facts: f, families: fam })));
    // +20 chips (x2), +1 mult (x3), theta chips doubled (x4: +40).
    expect(r.chips).toBeCloseTo(230 + 20 + 40);
    expect(r.mult).toBeCloseTo(3);
    expect(familyPassives({ ...emptyFamilies(), EXEC: 3 }).execution?.marketImprove).toBeCloseTo(0.1);
    expect(familyPassives({ ...emptyFamilies(), ECON: 4 }).freeFirstShopReroll).toBe(true);
  });

  it('Double Down doubles the meter for gains and losses', () => {
    const r = runScore(10_000, 500_000, scoreSteps(pipe({ doubleDown: true })));
    expect(r.points).toBe(920);
  });
});

describe('shop', () => {
  const st = initialState(cfg);

  it('prices by rarity, sells back for half, Clearance takes 25% off', () => {
    for (const c of CARTRIDGES) expect(cartridgePrice(c)).toBe(BALANCE.shop.prices[c.rarity]);
    expect(sellPrice(CARTRIDGE_BY_ID.theta_engine)).toBe(2);
    expect(cartridgePrice(CARTRIDGE_BY_ID.ladder_up, 0.75)).toBe(6);
    expect([0, 1, 2].map((n) => rerollCost(n, 0))).toEqual([5, 6, 7]);
    expect(rerollCost(0, -1)).toBe(4);
    expect(interestFor(23, 0)).toBe(4);
    expect(interestFor(100, 0)).toBe(5);
    expect(interestFor(100, 5)).toBe(10);
  });

  it('weights rarity about 60/28/10/2 and leans 60/40 toward the desk', () => {
    const pool = cartridgePool(st);
    const rng = new Rng('rarity');
    const count = { C: 0, U: 0, R: 0, L: 0 };
    let desk = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) {
      const c = pickCartridge(pool, rng, 'verticals');
      if (!c) continue;
      count[c.rarity]++;
      if (c.desks !== 'any') desk++;
    }
    expect(desk / n).toBeGreaterThan(0.54);
    expect(desk / n).toBeLessThan(0.66);
    expect(count.C / n).toBeGreaterThan(0.5);
    expect(count.U / n).toBeGreaterThan(0.2);
    expect(count.R / n).toBeGreaterThan(0.06);
    expect(count.L / n).toBeLessThan(0.05);
  });

  it('offers only desk-fit cartridges, duos only with both parents, no ARCADE in Pure Market', () => {
    const pool = cartridgePool(st);
    expect(pool.every((c) => c.desks === 'any' || c.desks.includes('verticals'))).toBe(true);
    expect(pool.some((c) => c.id === 'premium_printer')).toBe(false);
    expect(pool.some((c) => c.id === 'stop_discipline')).toBe(false); // owned from the start
    const withParents = cartridgePool({ ...st, cartridges: ['theta_engine', 'fifty_percent_club'] });
    expect(withParents.some((c) => c.id === 'premium_printer')).toBe(true);
    const pure = cartridgePool({ ...st, config: { ...cfg, pureMarket: true } });
    expect(pure.length).toBeGreaterThan(0);
    expect(pure.every((c) => c.tag !== 'ARCADE')).toBe(true);
  });

  it('generates a full shop deterministically', () => {
    const a = generateShop(st, new Rng('shop'), { priceMult: 1, cartridgeOffers: 2, analystOffers: 1 });
    const b = generateShop(st, new Rng('shop'), { priceMult: 1, cartridgeOffers: 2, analystOffers: 1 });
    expect(a).toEqual(b);
    expect(a.filter((x) => x.kind === 'cartridge').length).toBe(2);
    expect(a.filter((x) => x.kind === 'analyst').length).toBe(1);
    expect(a.filter((x) => x.kind === 'memo' || x.kind === 'page').length).toBe(2);
    expect(a.filter((x) => x.kind === 'voucher').length).toBe(1);
    const analyst = a.find((x) => x.kind === 'analyst');
    if (analyst?.kind === 'analyst' && analyst.id === 'quant') expect(analyst.level).toBe(2);
  });
});

describe('dealing', () => {
  const windows: WindowDef[] = Array.from({ length: 400 }, (_, i) => ({
    id: i,
    symbol: `S${i % 20}`,
    historyStart: '2019-01-01',
    entryDate: '2023-01-01',
    endDate: '2023-03-01',
    forwardDays: 50,
    recent: i % 4 !== 0,
    weight: 1,
    tags: {
      adx: i % 50,
      trendSlope: 0,
      vix: 15 + (i % 20),
      ivr: i % 100,
      hasEarnings: i % 3 === 0,
      hasExDiv: false,
      hasFomc: i % 5 === 0,
      maxGapAtr: 1,
      spreadPct: 0.05,
      spreadDecile: i % 10,
    },
  }));

  it('deals 75% recent windows, never repeats a symbol, honors the filter', () => {
    const rng = new Rng('deal');
    let recent = 0;
    let total = 0;
    for (let k = 0; k < 400; k++) {
      const { windows: w } = dealWindows(windows, rng, {
        count: 3,
        excludeWindows: new Set(),
        excludeSymbols: new Set(),
        indexSymbols: new Set(),
      });
      expect(new Set(w.map((x) => x.symbol)).size).toBe(3);
      recent += w.filter((x) => x.recent).length;
      total += w.length;
    }
    expect(recent / total).toBeGreaterThan(0.7);
    expect(recent / total).toBeLessThan(0.8);
    const { windows: e } = dealWindows(windows, new Rng('f'), {
      count: 3,
      filter: { hasEarnings: true },
      excludeWindows: new Set(),
      excludeSymbols: new Set(),
      indexSymbols: new Set(),
    });
    expect(e.every((x) => x.tags.hasEarnings)).toBe(true);
    const relaxed = dealWindows(windows, new Rng('f'), {
      count: 2,
      filter: { minVix: 99 },
      excludeWindows: new Set(),
      excludeSymbols: new Set(),
      indexSymbols: new Set(),
    });
    expect(relaxed.relaxed).toBe(true);
    expect(relaxed.windows.length).toBe(2);
  });
});

describe('content', () => {
  it('has 50 cartridges with unique ids, 2+ real synergy partners, valid duos', () => {
    expect(CARTRIDGES.length).toBe(50);
    expect(new Set(CARTRIDGES.map((c) => c.id)).size).toBe(50);
    for (const c of CARTRIDGES) {
      expect(c.synergies.length, c.id).toBeGreaterThanOrEqual(2);
      for (const s of c.synergies) expect(CARTRIDGE_BY_ID[s], `${c.id} -> ${s}`).toBeDefined();
      if (c.duoOf) for (const p of c.duoOf) expect(CARTRIDGE_BY_ID[p]).toBeDefined();
      expect(c.families.length).toBeGreaterThanOrEqual(1);
      expect(c.families.length).toBeLessThanOrEqual(2);
      expect(c.text.length).toBeGreaterThan(10);
    }
    const rar = (r: string) => CARTRIDGES.filter((c) => c.rarity === r).length;
    expect(rar('C') + rar('U') + rar('R') + rar('L')).toBe(50);
  });

  it('desks, analysts and Reviews reference real content', () => {
    for (const d of Object.values(DESKS)) {
      for (const c of d.startingCartridges) expect(CARTRIDGE_BY_ID[c]).toBeDefined();
      for (const a of d.startingAnalysts) expect(ANALYSTS[a]).toBeDefined();
      expect(d.structures.length).toBeGreaterThan(0);
    }
    expect(QUARTER_REVIEWS.length).toBe(9);
    for (const r of Object.values(REVIEWS)) expect(r.announce.length).toBeGreaterThan(20);
  });
});

describe('analyst tools', () => {
  it('base rates look only at the history they are given', () => {
    const bars = Array.from({ length: 300 }, (_, i) => ({
      date: `d${i}`,
      open: 100,
      high: 100,
      low: 100,
      close: 100 * (1 + 0.001 * i),
      volume: 1,
      source: 'real' as const,
    }));
    const up = baseRate(bars as never, 0.005, 5, 'up');
    expect(up?.rate).toBe(0);
    const dn = baseRate(bars as never, 0.001, 5, 'down');
    expect(dn?.rate).toBe(0);
    expect(baseRate(bars.slice(0, 10) as never, 0.01, 5, 'up')).toBeNull();
  });

  it('reads term structure and skew from a chain', () => {
    const q = (expiration: string, right: 'C' | 'P', strike: number, iv: number, delta: number) => ({
      expiration,
      right,
      strike,
      iv,
      delta,
      bid: 1,
      ask: 1.2,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
      source: 'real' as const,
    });
    const chain = {
      symbol: 'X',
      date: '2024-01-02',
      spot: 100,
      source: 'real' as const,
      quotes: [
        q('2024-01-19', 'C', 100, 0.4, 0.5),
        q('2024-01-19', 'P', 100, 0.42, -0.5),
        q('2024-02-16', 'C', 100, 0.3, 0.5),
        q('2024-02-16', 'P', 100, 0.32, -0.5),
        q('2024-01-19', 'P', 90, 0.5, -0.25),
        q('2024-01-19', 'C', 110, 0.35, 0.25),
      ],
    };
    const ts = termStructure(chain);
    expect(ts[0].iv).toBeGreaterThan(ts[1].iv);
    expect(skew25(chain, '2024-01-19')?.richer).toBe('puts');
  });
});
