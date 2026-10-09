import { describe, expect, it } from 'vitest';
import {
  describeTrade,
  legLines,
  orderText,
  priceDensity,
  probBetween,
  tosDate,
  tradeName,
} from '../../src/engine/strategies/study';
import type { Leg } from '../../src/engine/strategies/types';

const put = (strike: number, ratio: number, expiration = '2025-10-17'): Leg => ({
  kind: 'option',
  right: 'P',
  strike,
  expiration,
  ratio,
});
const call = (strike: number, ratio: number, expiration = '2025-10-17'): Leg => ({
  kind: 'option',
  right: 'C',
  strike,
  expiration,
  ratio,
});

describe('the Trade Builder readouts', () => {
  it('writes expirations and orders the way thinkorswim does', () => {
    expect(tosDate('2025-10-17')).toBe('17 OCT 25');
    expect(orderText('SPY', 'bull_put', [put(450, -1), put(445, 1)], 1, -1.2)).toBe(
      'SELL -1 VERTICAL SPY 100 17 OCT 25 450/445 PUT @1.20 LMT',
    );
    expect(orderText('SPY', 'bear_call', [call(460, -1), call(465, 1)], 2, -0.85)).toBe(
      'SELL -2 VERTICAL SPY 100 17 OCT 25 460/465 CALL @0.85 LMT',
    );
    expect(
      orderText('SPY', 'iron_condor', [put(435, 1), put(440, -1), call(460, -1), call(465, 1)], 1, -1.5),
    ).toBe('SELL -1 IRON CONDOR SPY 100 17 OCT 25 460/465/440/435 CALL/PUT @1.50 LMT');
    expect(orderText('QQQ', 'long_straddle', [call(400, 1), put(400, 1)], 1, 9)).toBe(
      'BUY +1 STRADDLE QQQ 100 17 OCT 25 400 @9.00 LMT',
    );
    expect(
      orderText('SPY', 'calendar', [call(450, -1, '2025-10-17'), call(450, 1, '2025-11-21')], 1, 2),
    ).toBe('BUY +1 CALENDAR SPY 100 17 OCT 25/21 NOV 25 450 CALL @2.00 LMT');
  });

  it('describes each leg and the whole position in plain words', () => {
    expect(legLines([put(450, -1), put(445, 1)], 2, '2025-10-05')).toEqual([
      'Sell 2 puts at 450 · 17 OCT 25 (12 days)',
      'Buy 2 puts at 445 · 17 OCT 25 (12 days)',
    ]);
    const d = describeTrade({
      symbol: 'SPY',
      structureId: 'bull_put',
      qty: 1,
      net: -1.2,
      maxProfit: 1.2,
      maxLoss: 3.8,
      breakevens: [448.8],
      pop: 0.72,
      expiration: '2025-10-17',
    });
    expect(d).toMatch(/You SELL the bull put spread for \$120 up front, betting SPY stays up/);
    expect(d).toMatch(/Best case \$120, worst case −\$380/);
    expect(d).toMatch(/Breakeven at 17 OCT 25: 448.80/);
    expect(d).toMatch(/about 72%/);
    // A single option is described as itself, whatever strategy the builder was on.
    const single = describeTrade({
      symbol: 'SPY',
      structureId: 'bull_call',
      qty: 1,
      net: 2.1,
      maxProfit: null,
      maxLoss: 2.1,
      breakevens: [452.1],
      pop: 0.41,
      expiration: '2025-10-17',
      legs: [call(450, 1)],
    });
    expect(single).toMatch(/You BUY the 450 call for \$210, betting SPY rises/);
    expect(single).toMatch(/Best case no fixed cap/);
    expect(tradeName('bull_put', [put(440, -1)])).toBe('Short put');
    expect(tradeName('bull_put', [put(440, -1), put(435, 1)])).toBe('Bull Put Spread');
    expect(orderText('SPY', 'bull_call', [call(450, 1)], 2, 2.1)).toBe(
      'BUY +2 SPY 100 17 OCT 25 450 CALL @2.10 LMT',
    );
  });

  it('spreads the expiration price the way the POP does', () => {
    // About 68% within one standard deviation, and the density sums to about 1.
    const sigma = 0.2;
    const t = 30 / 365;
    const sd = 100 * sigma * Math.sqrt(t);
    expect(probBetween(100, sigma, t, 0, 100 - sd, 100 + sd)).toBeCloseTo(0.68, 1);
    const xs = Array.from({ length: 401 }, (_, i) => 60 + i * 0.2);
    const dens = priceDensity(100, sigma, t, 0, xs);
    const area = dens.reduce((a, v) => a + v * 0.2, 0);
    expect(area).toBeGreaterThan(0.98);
    expect(area).toBeLessThan(1.02);
  });
});
