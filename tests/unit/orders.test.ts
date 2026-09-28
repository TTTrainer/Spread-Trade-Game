import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/engine/rng';
import { attemptFill, BASE_EXECUTION, combineImprove, limitFillProbability, marketPrice, restingFill } from '../../src/engine/orders/fill';
import { checkRisk, feesFor, pdtAllows } from '../../src/engine/orders/rules';
import { tradingDaysBetween } from '../../src/engine/calendar';
import type { Leg } from '../../src/engine/strategies/types';

// Selling a credit spread: cost convention, so collecting 1.20 at mid is -1.20 and natural is -1.10.
const q = { mid: -1.2, natural: -1.1 };

describe('fill model', () => {
  it('rises from ~35% at mid to 100% at natural', () => {
    expect(limitFillProbability(q, -1.2)).toBeCloseTo(0.35, 9);
    expect(limitFillProbability(q, -1.15)).toBeCloseTo(0.675, 9);
    expect(limitFillProbability(q, -1.1)).toBe(1);
    expect(limitFillProbability(q, -1.25)).toBeCloseTo(0.175, 9);
    expect(limitFillProbability(q, -1.3)).toBe(0);
    expect(limitFillProbability({ mid: 1, natural: 1 }, 1)).toBe(1);
    expect(limitFillProbability({ mid: 1, natural: 1 }, 0.9)).toBe(0);
  });

  it('fills at the stated rate over many seeded tries', () => {
    const rng = new Rng('fills');
    let n = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) if (attemptFill(q, { type: 'limit', limit: -1.15 }, rng).filled) n++;
    expect(n / trials).toBeGreaterThan(0.66);
    expect(n / trials).toBeLessThan(0.69);
  });

  it('is deterministic from the seed', () => {
    const a = Array.from({ length: 20 }, (_, i) => attemptFill(q, { type: 'limit', limit: -1.18 }, new Rng(`s${i}`)).filled);
    const b = Array.from({ length: 20 }, (_, i) => attemptFill(q, { type: 'limit', limit: -1.18 }, new Rng(`s${i}`)).filled);
    expect(a).toEqual(b);
  });

  it('market orders pay natural unless execution perks move them toward mid (never past it)', () => {
    const rng = new Rng('m');
    expect(attemptFill(q, { type: 'market' }, rng).price).toBeCloseTo(-1.1, 12);
    const router = { ...BASE_EXECUTION, marketImprove: 0.25 };
    expect(marketPrice(q, router)).toBeCloseTo(-1.125, 12);
    expect(marketPrice(q, { ...BASE_EXECUTION, marketImprove: 5 })).toBeCloseTo(-1.2, 12);
    // Rolls pay a little extra, but never beyond natural.
    expect(marketPrice(q, BASE_EXECUTION, true)).toBeCloseTo(-1.1, 12);
    expect(marketPrice(q, { ...BASE_EXECUTION, marketImprove: 0.5 }, true)).toBeCloseTo(-1.14, 12);
    expect(attemptFill(q, { type: 'market' }, rng, { ...BASE_EXECUTION, marketOrdersDisabled: true }).filled).toBe(false);
    expect(attemptFill(q, { type: 'limit', limit: -1.0 }, rng).price).toBeCloseTo(-1.1, 12);
    expect(attemptFill(q, { type: 'limit', atMid: true }, rng).price).toBe(-1.2);
  });

  it('limit boosts and tier penalties shift probability', () => {
    expect(limitFillProbability(q, -1.2, { ...BASE_EXECUTION, limitBoost: 0.15 })).toBeCloseTo(0.35 + 0.65 * 0.15, 9);
    expect(limitFillProbability(q, -1.2, { ...BASE_EXECUTION, fillPenalty: 0.1 })).toBeCloseTo(0.25, 9);
    expect(combineImprove([0.1, 0.25])).toBeCloseTo(1 - 0.9 * 0.75, 12);
  });

  it('resting orders fill only when the quote crosses', () => {
    expect(restingFill({ mid: -1.0, natural: -0.95 }, -1.1).filled).toBe(false);
    expect(restingFill({ mid: -1.2, natural: -1.12 }, -1.1)).toMatchObject({ filled: true, price: -1.1 });
  });
});

describe('account rules', () => {
  const spread: Leg[] = [
    { kind: 'option', right: 'P', strike: 95, expiration: '2025-01-31', ratio: -1 },
    { kind: 'option', right: 'P', strike: 90, expiration: '2025-01-31', ratio: 1 },
  ];

  it('charges $0.65 per contract per leg only when fees are on', () => {
    expect(feesFor(spread, 3, true)).toBe(390);
    expect(feesFor(spread, 3, false)).toBe(0);
    expect(feesFor([{ kind: 'stock', ratio: 1 }, spread[0]], 2, true)).toBe(130);
  });

  it('limits pattern day traders under $25k', () => {
    const days = tradingDaysBetween('2025-01-06', '2025-01-10');
    expect(pdtAllows({ enabled: true, equityCents: 500_000, recentDayTrades: ['2025-01-06', '2025-01-07'], tradingDaysBack: days })).toBe(true);
    expect(pdtAllows({ enabled: true, equityCents: 500_000, recentDayTrades: ['2025-01-06', '2025-01-07', '2025-01-08'], tradingDaysBack: days })).toBe(false);
    expect(pdtAllows({ enabled: true, equityCents: 3_000_000, recentDayTrades: ['2025-01-06', '2025-01-07', '2025-01-08'], tradingDaysBack: days })).toBe(true);
    expect(pdtAllows({ enabled: false, equityCents: 1, recentDayTrades: ['2025-01-06', '2025-01-07', '2025-01-08'], tradingDaysBack: days })).toBe(true);
    // Old day trades roll out of the 5-day window.
    expect(pdtAllows({ enabled: true, equityCents: 1, recentDayTrades: ['2024-12-20', '2024-12-23', '2024-12-24'], tradingDaysBack: days })).toBe(true);
  });

  it('enforces the risk cap and buying power', () => {
    expect(checkRisk({ maxLossCents: 40_000, collateralCents: 40_000, equityCents: 500_000, riskCapPct: 0.1, reservedCents: 0 }).ok).toBe(true);
    const over = checkRisk({ maxLossCents: 60_000, collateralCents: 60_000, equityCents: 500_000, riskCapPct: 0.1, reservedCents: 0 });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toMatch(/cap is 10.0%/);
    expect(checkRisk({ maxLossCents: 40_000, collateralCents: 400_000, equityCents: 500_000, riskCapPct: 0.1, reservedCents: 200_000 }).ok).toBe(false);
    expect(checkRisk({ maxLossCents: 0, collateralCents: 0, equityCents: 500_000, riskCapPct: 0.1, reservedCents: 0 }).ok).toBe(false);
  });
});
