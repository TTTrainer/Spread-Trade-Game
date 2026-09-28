import { describe, expect, it } from 'vitest';
import { adx, atr, bollinger, ema, historicalVol, keltner, last, lastMacdCross, macd, relativeVolume, rsi, sma, smaSlopePct, supportResistance } from '../../src/engine/market/indicators';
import { buildContext, type MarketContext } from '../../src/engine/market/context';
import { maxContracts, meetsRR, planTrade } from '../../src/engine/trading/plan';
import { filterWindows } from '../../src/engine/market/filter';
import type { Bar, WindowDef } from '../../src/engine/market/types';
import type { TradeMetrics } from '../../src/engine/strategies/metrics';
import { flatChain } from '../helpers/market';

const bars = (closes: number[]): Bar[] =>
  closes.map((c, i) => ({ date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`, open: c * 0.995, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 + i * 10, source: 'real' as const }));

describe('indicators', () => {
  const up = Array.from({ length: 80 }, (_, i) => 100 + i + Math.sin(i) * 2);
  const b = bars(up);

  it('compute on a trending series', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    expect(ema([1, 2, 3, 4], 2)[1]).toBe(1.5);
    expect(last(rsi(up)) as number).toBeGreaterThan(55);
    expect(rsi([1, 2, 3])).toEqual([null, null, null]);
    expect(rsi(Array.from({ length: 20 }, (_, i) => i + 1)).at(-1)).toBe(100);
    expect(last(adx(b)) as number).toBeGreaterThan(20);
    expect(adx(b.slice(0, 10)).every((x) => x === null)).toBe(true);
    expect(last(atr(b)) as number).toBeGreaterThan(0);
    expect(atr(b.slice(0, 5)).every((x) => x === null)).toBe(true);
    const bb = bollinger(up).at(-1);
    expect((bb?.upper as number) > (bb?.lower as number)).toBe(true);
    const kc = keltner(b).at(-1);
    expect((kc?.upper as number) > (kc?.mid as number)).toBe(true);
    expect(last(historicalVol(up)) as number).toBeGreaterThan(0);
    expect(smaSlopePct(up) as number).toBeGreaterThan(0);
    expect(smaSlopePct(up.slice(0, 20))).toBeNull();
    expect(last(relativeVolume(b)) as number).toBeGreaterThan(0.9);
    const m = macd(up);
    expect(m.at(-1)?.signal).not.toBeNull();
    const zig = Array.from({ length: 120 }, (_, i) => 100 + 10 * Math.sin(i / 8));
    expect(lastMacdCross(macd(zig))).not.toBeNull();
    const sr = supportResistance(bars(zig));
    expect(sr.length).toBeGreaterThan(0);
    expect(supportResistance(bars([1, 2]))).toEqual([]);
  });
});

describe('trade planner', () => {
  const chain = flatChain({ date: '2025-01-03', spot: 100, expirations: ['2025-01-31', '2025-02-28'] });
  const ctx = buildContext({ bars: bars(Array.from({ length: 260 }, (_, i) => 90 + i * 0.04)), vol: [{ date: '2025-01-03', iv30: 0.3, hv20: 0.25, ivr: 20, ivp: 30 }], upcomingEarnings: [], pastEarnings: [], dividends: [], macro: [], vix: 18 });
  const input = { chain, ctx: { ...ctx, spot: 100 } as MarketContext, equityCents: 500_000, riskCapPct: 0.1, reservedCents: 0, rate: 0.03 };

  it('plans a bull put and sizes it to the cap', () => {
    const p = planTrade({ ...input, structureId: 'bull_put', params: { expiration: '2025-01-31', delta: 0.3, width: 2 }, qty: 1 });
    expect(p.ok).toBe(true);
    expect(p.edge).not.toBeNull();
    expect(p.entry?.shortStrikes).toHaveLength(1);
    const n = maxContracts(p, 500_000, 0.1, 0);
    expect(n).toBeGreaterThanOrEqual(1);
    const big = planTrade({ ...input, structureId: 'bull_put', params: { expiration: '2025-01-31', delta: 0.3, width: 2 }, qty: n + 1 });
    expect(big.ok).toBe(false);
    expect(maxContracts(big, 500_000, 0.1, 0)).toBe(0);
  });

  it('rejects illegal builds with reasons', () => {
    expect(planTrade({ ...input, structureId: 'bull_put', params: { expiration: '2025-01-31', delta: 0.3, width: 2 }, qty: 0 }).reason).toMatch(/whole number/);
    expect(planTrade({ ...input, structureId: 'bull_put', params: { expiration: '2025-01-31', delta: 0.3, width: 0 }, qty: 1 }).reason).toMatch(/Width/);
    const noQuote = planTrade({ ...input, structureId: 'bull_put', params: { expiration: '2025-01-31', delta: 0.3, width: 2 }, qty: 1, legs: [{ kind: 'option', right: 'P', strike: 1, expiration: '2025-01-31', ratio: -1 }] });
    expect(noQuote.reason).toMatch(/no quote/);
    const debitAsCredit = planTrade({
      ...input,
      structureId: 'bull_put',
      params: { expiration: '2025-01-31', delta: 0.3, width: 2 },
      qty: 1,
      legs: [
        { kind: 'option', right: 'P', strike: 95, expiration: '2025-01-31', ratio: 1 },
        { kind: 'option', right: 'P', strike: 93, expiration: '2025-01-31', ratio: -1 },
      ],
    });
    expect(debitAsCredit.reason).toMatch(/no credit/);
    const zeroWidth = planTrade({
      ...input,
      structureId: 'bull_call',
      params: { expiration: '2025-01-31', delta: 0.5, width: 2 },
      qty: 1,
      legs: [{ kind: 'option', right: 'C', strike: 100, expiration: '2025-01-31', ratio: 1 }],
    });
    expect(zeroWidth.reason).toMatch(/Width is zero/);
  });

  it('measures income trades against a stress loss and full collateral', () => {
    const csp = planTrade({ ...input, equityCents: 5_000_000, structureId: 'cash_secured_put', params: { expiration: '2025-01-31', delta: 0.3, width: 0 }, qty: 1 });
    expect(csp.collateralCents).toBeGreaterThan(900_000);
    expect(csp.riskCents).toBeLessThan(csp.maxLossCents);
    expect(csp.ok).toBe(true);
    const cc = planTrade({ ...input, equityCents: 5_000_000, structureId: 'covered_call', params: { expiration: '2025-01-31', delta: 0.3, width: 0 }, qty: 1 });
    expect(cc.collateralCents).toBeGreaterThan(900_000);
    expect(planTrade({ ...input, structureId: 'cash_secured_put', params: { expiration: '2025-01-31', delta: 0.3, width: 0 }, qty: 1 }).ok).toBe(false);
  });

  it('applies each structure family\'s R:R rule', () => {
    const m = (entryNet: number, width: number, maxProfit: number | null = 1): TradeMetrics =>
      ({ entryNet, width, maxProfit, maxLoss: 1, breakevens: [], pop: 0.5, rewardToRisk: 1, credit: entryNet < 0, greeks: { delta: 0, gamma: 0, theta: 0, vega: 0 }, expectedMove: 5 }) as TradeMetrics;
    const c = { ...ctx, spot: 100, ivr: 20 } as MarketContext;
    expect(meetsRR('bull_put', m(-0.7, 2), c, 30)).toBe(true);
    expect(meetsRR('bull_put', m(-0.5, 2), c, 30)).toBe(false);
    expect(meetsRR('bull_call', m(0.9, 2), c, 30)).toBe(true);
    expect(meetsRR('bull_call', m(1.2, 2), c, 30)).toBe(false);
    expect(meetsRR('long_straddle', m(6, 0), c, 30)).toBe(true);
    expect(meetsRR('long_straddle', m(6, 0), { ...c, ivr: 60 }, 30)).toBe(false);
    expect(meetsRR('cash_secured_put', m(-1.5, 0), c, 30)).toBe(true);
    expect(meetsRR('covered_call', m(99, 0), c, 30)).toBe(false);
    expect(meetsRR('calendar', m(2, 0, 4), c, 30)).toBe(true);
    expect(meetsRR('calendar', m(2, 0, 2), c, 30)).toBe(false);
  });

  it('filters windows for Reviews', () => {
    const w = (tags: Partial<WindowDef['tags']>, extra: Partial<WindowDef> = {}): WindowDef => ({
      id: 1,
      symbol: 'A',
      historyStart: '2023-01-01',
      entryDate: '2024-01-02',
      endDate: '2024-03-01',
      forwardDays: 50,
      recent: true,
      weight: 1,
      tags: { adx: 20, trendSlope: 0, vix: 18, ivr: 40, hasEarnings: false, hasExDiv: false, hasFomc: true, maxGapAtr: 1, spreadPct: 0.02, spreadDecile: 5, ...tags },
      ...extra,
    });
    const all = [w({ adx: 12 }), w({ adx: 35, hasEarnings: true }), w({ vix: 30, ivr: 10 }), w({ maxGapAtr: 3, spreadDecile: 9, hasExDiv: true }, { symbol: 'B', recent: false, entryDate: '2020-01-02' })];
    expect(filterWindows(all, { maxAdx: 18 })).toHaveLength(1);
    expect(filterWindows(all, { minAdx: 30, hasEarnings: true })).toHaveLength(1);
    expect(filterWindows(all, { minVix: 25, maxIvr: 15 })).toHaveLength(1);
    expect(filterWindows(all, { minIvr: 30 })).toHaveLength(3);
    expect(filterWindows(all, { minGapAtr: 2, minSpreadDecile: 9, hasExDiv: true, hasFomc: true })).toHaveLength(1);
    expect(filterWindows(all, { symbols: ['B'], recent: false, entryFrom: '2019-01-01', entryTo: '2021-01-01' })).toHaveLength(1);
    expect(filterWindows(all, { limit: 2 })).toHaveLength(2);
  });
});
