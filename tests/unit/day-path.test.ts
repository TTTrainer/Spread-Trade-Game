import { describe, expect, it } from 'vitest';
import { formingBar, intradayPath, livePl, priceAt, strikeTension } from '../../src/ui/trading/dayPath';
import { Rng } from '../../src/engine/rng';

describe('day playback', () => {
  it('walks every candle from open through its real high and low to its close', () => {
    const rng = new Rng('paths');
    for (let i = 0; i < 300; i++) {
      const a = rng.range(50, 150);
      const b = a * rng.range(0.95, 1.05);
      const bar = {
        open: a,
        close: b,
        high: Math.max(a, b) * rng.range(1, 1.02),
        low: Math.min(a, b) * rng.range(0.98, 1),
      };
      const path = intradayPath(bar, `s${i}`);
      expect(path[0]).toBe(bar.open);
      expect(path[path.length - 1]).toBe(bar.close);
      expect(Math.max(...path)).toBeCloseTo(bar.high, 9);
      expect(Math.min(...path)).toBeCloseTo(bar.low, 9);
      for (let t = 0; t <= 1; t += 0.05) {
        const p = priceAt(path, t);
        expect(p).toBeGreaterThanOrEqual(bar.low - 1e-9);
        expect(p).toBeLessThanOrEqual(bar.high + 1e-9);
      }
      // The finished candle is exactly the real one.
      const done = formingBar(path, 1);
      expect(done.open).toBe(bar.open);
      expect(done.close).toBe(bar.close);
      expect(done.high).toBeCloseTo(bar.high, 9);
      expect(done.low).toBeCloseTo(bar.low, 9);
    }
  });

  it('grows the candle monotonically as the day plays', () => {
    const path = intradayPath({ open: 100, high: 104, low: 97, close: 103 }, 'grow');
    let prev = formingBar(path, 0);
    for (let t = 0.02; t <= 1; t += 0.02) {
      const b = formingBar(path, t);
      expect(b.high).toBeGreaterThanOrEqual(prev.high - 1e-9);
      expect(b.low).toBeLessThanOrEqual(prev.low + 1e-9);
      prev = b;
    }
  });

  it('rates how close the day came to a short strike', () => {
    expect(strikeTension([100], { open: 103, high: 104, low: 99, close: 102 })).toBe(1);
    expect(strikeTension([100], { open: 110, high: 111, low: 109, close: 110 })).toBe(0);
    const near = strikeTension([100], { open: 102, high: 103, low: 101, close: 102 });
    expect(near).toBeGreaterThan(0.4);
    expect(near).toBeLessThan(1);
    expect(strikeTension([], { open: 1, high: 1, low: 1, close: 1 })).toBe(0);
  });

  it('lands the live P/L exactly on the settled P/L', () => {
    const o = { prevCents: 1000, finalCents: 1850, deltaDollars: 30, thetaDollars: 4, prevClose: 100 };
    expect(livePl(o, 100, 0)).toBe(1000);
    expect(livePl(o, 103, 1)).toBe(1850);
    // Mid-day, it moves with the price the way delta says.
    expect(livePl(o, 101, 0.3)).toBeGreaterThan(livePl(o, 99, 0.3));
  });
});
