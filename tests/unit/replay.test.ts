import { describe, expect, it } from 'vitest';
import type { Bar } from '../../src/engine/market/types';
import {
  pastLevel,
  replayResult,
  replayWindow,
  safeDay,
  snapStrike,
  strikeAtEntry,
} from '../../src/engine/teach/replay';

const day = (i: number) => `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
const bar = (i: number, close: number, spread = 1): Bar => ({
  date: day(i),
  open: close,
  high: close + spread,
  low: close - spread,
  close,
  volume: 1000,
  source: 'real',
});

/** A chart that bounces off 95 a few times, then drifts up. */
function bouncing(n: number): Bar[] {
  return Array.from({ length: n }, (_, i) => bar(i, 100 + 4 * Math.sin(i / 3) + i * 0.02));
}

describe('the course replay', () => {
  it('cuts the chart at an entry day and plays the days after it', () => {
    const bars = bouncing(120);
    const w = replayWindow(bars, 'put', 21, 60)!;
    expect(w.history).toHaveLength(60);
    expect(w.play).toHaveLength(21);
    // No overlap and no gap: the first played day is the day after the entry day.
    expect(bars.indexOf(w.history.at(-1)!) + 1).toBe(bars.indexOf(w.play[0]));
    expect(w.spot).toBe(w.history.at(-1)!.close);
    // The floor is read from the history only.
    expect(w.level?.kind).toBe('floor');
    expect(w.level!.touches.every((t) => t.date <= w.history.at(-1)!.date)).toBe(true);
    expect(replayWindow(bars.slice(0, 50), 'put')).toBeNull();
  });

  it('counts a day safe only when its candle stays clear of the strike', () => {
    expect(safeDay(bar(0, 100, 2), 97, 'put')).toBe(true);
    expect(safeDay(bar(0, 100, 3), 97, 'put')).toBe(false);
    expect(safeDay(bar(0, 100, 2), 103, 'call')).toBe(true);
    expect(safeDay(bar(0, 100, 3), 103, 'call')).toBe(false);
    const play = [bar(0, 100), bar(1, 99), bar(2, 96), bar(3, 101)];
    expect(replayResult(play, 97, 'put')).toEqual({ safeDays: 3, touchedOn: 3, endedPast: false });
    expect(replayResult(play, 90, 'put')).toEqual({ safeDays: 4, touchedOn: null, endedPast: false });
    expect(replayResult(play, 102, 'put').endedPast).toBe(true);
  });

  it('snaps to listed strikes and moves a setup to the entry day by distance', () => {
    expect(snapStrike(271.3, 320)).toBe(270);
    expect(snapStrike(48.6, 50)).toBe(49);
    expect(strikeAtEntry(92, 100, 200)).toBe(185);
    expect(pastLevel(90, 'put', { kind: 'floor', price: 95, touches: [] })).toBe(true);
    expect(pastLevel(96, 'put', { kind: 'floor', price: 95, touches: [] })).toBe(false);
    expect(pastLevel(110, 'call', { kind: 'ceiling', price: 105, touches: [] })).toBe(true);
    expect(pastLevel(110, 'call', null)).toBe(false);
  });
});
