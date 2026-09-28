import { describe, expect, it } from 'vitest';
import { bsm, bsmPrice, forward, impliedVol, normCdf, normInv, normPdf } from '../../src/engine/pricing/bsm';
import { buildChain, gridSurface, marketAround, strikeGrid, strikeIncrement } from '../../src/engine/pricing/chainModel';

describe('Black-Scholes-Merton golden values', () => {
  it('matches textbook prices', () => {
    // Hull: S=42, K=40, r=10%, sigma=20%, T=0.5
    expect(bsmPrice({ right: 'C', spot: 42, strike: 40, t: 0.5, vol: 0.2, rate: 0.1, divYield: 0 })).toBeCloseTo(4.7594, 4);
    expect(bsmPrice({ right: 'P', spot: 42, strike: 40, t: 0.5, vol: 0.2, rate: 0.1, divYield: 0 })).toBeCloseTo(0.8086, 4);
    // S=K=100, r=5%, sigma=20%, T=1
    expect(bsmPrice({ right: 'C', spot: 100, strike: 100, t: 1, vol: 0.2, rate: 0.05, divYield: 0 })).toBeCloseTo(10.4506, 4);
    expect(bsmPrice({ right: 'P', spot: 100, strike: 100, t: 1, vol: 0.2, rate: 0.05, divYield: 0 })).toBeCloseTo(5.5735, 4);
    // Haug generalized BSM put: S=100, K=95, T=0.5, r=10%, cost of carry 5% (q=5%), sigma=20%
    expect(bsmPrice({ right: 'P', spot: 100, strike: 95, t: 0.5, vol: 0.2, rate: 0.1, divYield: 0.05 })).toBeCloseTo(2.4648, 4);
  });

  it('satisfies put-call parity with dividends', () => {
    for (const k of [80, 95, 100, 120]) {
      const inp = { spot: 100, strike: k, t: 0.3, vol: 0.35, rate: 0.04, divYield: 0.02 };
      const c = bsmPrice({ ...inp, right: 'C' });
      const p = bsmPrice({ ...inp, right: 'P' });
      expect(c - p).toBeCloseTo(100 * Math.exp(-0.02 * 0.3) - k * Math.exp(-0.04 * 0.3), 10);
    }
  });

  it('has greeks that match finite differences', () => {
    const base = { spot: 100, strike: 105, t: 0.25, vol: 0.3, rate: 0.03, divYield: 0.01 };
    for (const right of ['C', 'P'] as const) {
      const g = bsm({ ...base, right });
      const h = 0.01;
      const up = bsmPrice({ ...base, right, spot: 100 + h });
      const dn = bsmPrice({ ...base, right, spot: 100 - h });
      expect(g.delta).toBeCloseTo((up - dn) / (2 * h), 5);
      expect(g.gamma).toBeCloseTo((up - 2 * g.price + dn) / (h * h), 3);
      const vUp = bsmPrice({ ...base, right, vol: 0.31 });
      expect(g.vega).toBeCloseTo(vUp - g.price, 2);
      const tomorrow = bsmPrice({ ...base, right, t: 0.25 - 1 / 365 });
      expect(g.theta).toBeCloseTo(tomorrow - g.price, 3);
      const rUp = bsmPrice({ ...base, right, rate: 0.04 });
      expect(g.rho).toBeCloseTo(rUp - g.price, 2);
    }
  });

  it('handles expiry and zero vol at intrinsic', () => {
    expect(bsm({ right: 'C', spot: 110, strike: 100, t: 0, vol: 0.3, rate: 0.03, divYield: 0 })).toMatchObject({ price: 10, delta: 1 });
    expect(bsm({ right: 'P', spot: 110, strike: 100, t: 0, vol: 0.3, rate: 0.03, divYield: 0 })).toMatchObject({ price: 0, delta: 0 });
    expect(bsm({ right: 'P', spot: 90, strike: 100, t: 0.1, vol: 0, rate: 0.03, divYield: 0 }).delta).toBe(-1);
  });

  it('round-trips implied volatility across a grid', () => {
    for (const right of ['C', 'P'] as const)
      for (const k of [60, 90, 100, 110, 150])
        for (const t of [3 / 365, 30 / 365, 1])
          for (const vol of [0.08, 0.3, 1.2, 3]) {
            const inp = { right, spot: 100, strike: k, t, rate: 0.04, divYield: 0.01 };
            const price = bsmPrice({ ...inp, vol });
            if (price < 1e-6) continue;
            const iv = impliedVol(price, inp);
            expect(iv).not.toBeNull();
            expect(bsmPrice({ ...inp, vol: iv as number })).toBeCloseTo(price, 6);
          }
  });

  it('rejects prices outside no-arbitrage bounds', () => {
    const inp = { right: 'C' as const, spot: 100, strike: 100, t: 0.5, rate: 0.03, divYield: 0 };
    expect(impliedVol(150, inp)).toBeNull();
    expect(impliedVol(-1, inp)).toBeNull();
    expect(impliedVol(5, { ...inp, t: 0 })).toBeNull();
    const deepItm = { right: 'C' as const, spot: 150, strike: 100, t: 0.5, rate: 0, divYield: 0 };
    expect(impliedVol(50, deepItm)).toBeCloseTo(1e-4, 6);
  });

  it('normal distribution helpers are accurate', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 15);
    expect(normCdf(1.959963984540054)).toBeCloseTo(0.975, 12);
    expect(normCdf(-3)).toBeCloseTo(0.0013498980316301, 13);
    expect(normCdf(40)).toBe(1);
    expect(normCdf(-40)).toBe(0);
    expect(normCdf(8)).toBeCloseTo(1, 12);
    expect(normPdf(0)).toBeCloseTo(0.3989422804014327, 15);
    for (const p of [0.001, 0.02, 0.3, 0.5, 0.9, 0.999]) expect(normCdf(normInv(p))).toBeCloseTo(p, 8);
    expect(normInv(0)).toBe(-Infinity);
    expect(normInv(1)).toBe(Infinity);
    expect(forward(100, 1, 0.05, 0.05)).toBeCloseTo(100, 12);
  });
});

describe('chain model', () => {
  it('lists strikes on sensible increments', () => {
    expect(strikeIncrement(12)).toBe(0.5);
    expect(strikeIncrement(45)).toBe(1);
    expect(strikeIncrement(120)).toBe(2.5);
    expect(strikeIncrement(300)).toBe(5);
    expect(strikeIncrement(900)).toBe(10);
    expect(strikeIncrement(2000)).toBe(25);
    const g = strikeGrid(100);
    expect(g[0]).toBe(70);
    expect(g[g.length - 1]).toBe(130);
  });

  it('rounds theoretical prices out to a penny market', () => {
    expect(marketAround(1.234, 0.05)).toEqual({ bid: 1.18, ask: 1.29 });
    expect(marketAround(0.001, 0.001)).toEqual({ bid: 0, ask: 0.01 });
  });

  it('interpolates a grid surface in total variance', () => {
    const s = gridSurface(
      [
        { dte: 10, logMoneyness: -0.1, iv: 0.4 },
        { dte: 10, logMoneyness: 0.1, iv: 0.3 },
        { dte: 40, logMoneyness: -0.1, iv: 0.3 },
        { dte: 40, logMoneyness: 0.1, iv: 0.3 },
      ],
      () => 0.01,
    );
    expect(s.iv('x', 100, 10 / 365, 100)).toBeCloseTo(0.35, 6);
    expect(s.iv('x', 50, 10 / 365, 100)).toBeCloseTo(0.4, 6);
    const mid = s.iv('x', 100, 25 / 365, 100);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.35);
    expect(s.iv('x', 100, 90 / 365, 100)).toBeCloseTo(0.3, 6);
    expect(gridSurface([], () => 0).iv('x', 1, 1, 1)).toBe(0.3);
  });

  it('builds a chain where puts and calls agree on IV', () => {
    const c = buildChain({
      symbol: 'T',
      date: '2025-01-02',
      spot: 100,
      rate: 0.03,
      divYield: 0,
      expirations: ['2025-01-17'],
      model: { iv: () => 0.25, halfSpread: () => 0.02 },
      source: 'synthetic',
    });
    expect(c.quotes.every((q) => q.iv === 0.25 && q.ask > q.bid)).toBe(true);
  });
});
