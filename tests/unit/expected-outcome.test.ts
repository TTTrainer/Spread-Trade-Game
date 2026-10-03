import { describe, expect, it } from 'vitest';
import { bsm } from '../../src/engine/pricing/bsm';
import { expectedOutcome, type PricingEnv } from '../../src/engine/strategies/metrics';
import type { OptionLeg } from '../../src/engine/strategies/types';

const env = (iv = 0.3): PricingEnv => ({ date: '2024-01-02', rate: 0, divYield: 0, ivOf: () => iv });
const leg = (right: 'C' | 'P', strike: number, ratio: number): OptionLeg => ({
  kind: 'option',
  right,
  strike,
  expiration: '2024-02-01',
  ratio,
});
const T = 30 / 365;
const fair = (right: 'C' | 'P', k: number, vol: number) =>
  bsm({ right, spot: 100, strike: k, t: T, vol, rate: 0, divYield: 0 }).price;

describe('probability-weighted outcome', () => {
  it('a fairly priced option is worth about zero on average at its own volatility', () => {
    const px = fair('C', 105, 0.3);
    const o = expectedOutcome([leg('C', 105, 1)], px, env(), 100, 0.3, 'implied', px);
    expect(Math.abs(o.ev)).toBeLessThan(0.01);
    expect(o.expGain).toBeGreaterThan(0);
    expect(o.expLoss).toBeGreaterThan(0);
  });

  it("keeps a credit spread's weighted gain and loss inside its real limits", () => {
    const credit = fair('P', 95, 0.3) - fair('P', 90, 0.3);
    const legs = [leg('P', 95, -1), leg('P', 90, 1)];
    const o = expectedOutcome(legs, -credit, env(), 100, 0.3, 'implied', 5 - credit);
    expect(o.expGain).toBeLessThanOrEqual(credit + 1e-9);
    expect(o.expLoss).toBeLessThanOrEqual(5 - credit + 1e-9);
    expect(o.ev).toBeCloseTo(o.expGain - o.expLoss, 12);
    // Fairly priced: close to even at the same volatility.
    expect(Math.abs(o.ev)).toBeLessThan(0.02);
  });

  it('shows a premium seller the edge when options price more movement than the stock has', () => {
    const credit = fair('P', 95, 0.35) - fair('P', 90, 0.35);
    const legs = [leg('P', 95, -1), leg('P', 90, 1)];
    const calm = expectedOutcome(legs, -credit, env(0.35), 100, 0.2, 'realized', 5 - credit);
    const wild = expectedOutcome(legs, -credit, env(0.35), 100, 0.5, 'realized', 5 - credit);
    expect(calm.ev).toBeGreaterThan(0);
    expect(wild.ev).toBeLessThan(0);
  });

  it('a short strike closer to the price loses more often, even with a better credit-to-width', () => {
    const vol = 0.3;
    const near = [leg('P', 99, -1), leg('P', 94, 1)];
    const far = [leg('P', 92, -1), leg('P', 87, 1)];
    const cNear = fair('P', 99, vol) - fair('P', 94, vol);
    const cFar = fair('P', 92, vol) - fair('P', 87, vol);
    const oNear = expectedOutcome(near, -cNear, env(vol), 100, vol, 'implied', 5 - cNear);
    const oFar = expectedOutcome(far, -cFar, env(vol), 100, vol, 'implied', 5 - cFar);
    // The straight line says the near spread is the better deal...
    expect(cNear / (5 - cNear)).toBeGreaterThan(cFar / (5 - cFar));
    // ...but it hits max loss and touches its short strike far more often.
    expect(oNear.pMaxLoss).toBeGreaterThan(oFar.pMaxLoss * 2);
    expect(oNear.pTouch!).toBeGreaterThan(oFar.pTouch!);
    expect(oNear.expLoss).toBeGreaterThan(oFar.expLoss);
  });

  it('touch odds are about twice the odds of finishing beyond the strike, capped at 100%', () => {
    const o = expectedOutcome([leg('P', 100, -1), leg('P', 95, 1)], -2.5, env(), 100, 0.3, 'implied', 2.5);
    expect(o.pTouch).toBeGreaterThan(0.95);
    expect(o.pTouch).toBeLessThanOrEqual(1);
  });
});
