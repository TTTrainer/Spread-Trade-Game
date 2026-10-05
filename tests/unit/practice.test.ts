import { describe, expect, it } from 'vitest';
import { practiceLean, practiceLevel, practicePick } from '../../src/engine/teach/practice';
import type { Bar } from '../../src/engine/market/types';

/** Bars from a list of closes; highs and lows sit 0.5 either side unless given. */
function bars(closes: number[], lows?: Record<number, number>, highs?: Record<number, number>): Bar[] {
  return closes.map((c, i) => ({
    date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
    open: c,
    high: highs?.[i] ?? c + 0.5,
    low: lows?.[i] ?? c - 0.5,
    close: c,
    volume: 1000,
  })) as Bar[];
}

describe('the tutorial practice trade', () => {
  it('finds the floor a rising stock bounced off twice', () => {
    // Dips to ~95 at day 10 and day 25, then climbs to 105.
    const closes = Array.from({ length: 40 }, (_, i) =>
      i < 10 ? 100 - i * 0.5 : i < 18 ? 95 + (i - 10) : i < 25 ? 103 - (i - 18) * 1.1 : 95.3 + (i - 25) * 0.7,
    );
    const b = bars(closes, { 10: 94.2, 25: 94.6 });
    expect(practiceLean(b)).toBe('up');
    const lv = practiceLevel(b, 'up')!;
    expect(lv.kind).toBe('floor');
    expect(lv.touches.length).toBeGreaterThanOrEqual(2);
    expect(lv.price).toBeCloseTo(94.2, 5);
    expect(lv.price).toBeLessThan(b.at(-1)!.close);
  });

  it('finds the ceiling a falling stock topped out at', () => {
    const closes = Array.from({ length: 40 }, (_, i) =>
      i < 10
        ? 100 + i * 0.5
        : i < 18
          ? 105 - (i - 10)
          : i < 25
            ? 97 + (i - 18) * 1.1
            : 104.6 - (i - 25) * 0.7,
    );
    const b = bars(closes, undefined, { 10: 105.8, 25: 105.4 });
    expect(practiceLean(b)).toBe('down');
    const lv = practiceLevel(b, 'down')!;
    expect(lv.kind).toBe('ceiling');
    expect(lv.price).toBeCloseTo(105.8, 5);
    expect(lv.price).toBeGreaterThan(b.at(-1)!.close);
  });

  it('only reads the bars it is given (nothing past today)', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 3);
    const b = bars(closes);
    const before = practiceLevel(b.slice(0, 30), 'up');
    const later = practiceLevel(b, 'up');
    expect(before?.touches.every((t) => t.date <= b[29].date)).toBe(true);
    expect(later).not.toBeNull();
  });

  it('picks the boldest strike beyond the level that keeps POP near 80%', () => {
    const floor = { kind: 'floor' as const, price: 95, touches: [] };
    const opts = [
      { strike: 98, pop: 0.6 },
      { strike: 96, pop: 0.7 },
      { strike: 94, pop: 0.78 },
      { strike: 92, pop: 0.86 },
      { strike: 90, pop: 0.92 },
    ];
    expect(practicePick(floor, opts)?.strike).toBe(94);
    // Nothing beyond the level is near 80%: the POP closest to it wins.
    expect(practicePick(floor, opts.slice(0, 2))?.strike).toBe(96);
    expect(practicePick(floor, [])).toBeNull();
  });
});
