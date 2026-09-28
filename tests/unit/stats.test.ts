import { describe, expect, it } from 'vitest';
import {
  breakdown,
  calibration,
  equityCurve,
  mistakeTrends,
  summarize,
  toCsv,
  type LedgerTrade,
} from '../../src/engine/stats/stats';

const t = (i: number, pl: number, extra: Partial<LedgerTrade> = {}): LedgerTrade => ({
  id: `t${i}`,
  mode: 'career',
  desk: 'verticals',
  closedOn: `2025-01-${String(i).padStart(2, '0')}`,
  openedOn: '2025-01-01',
  symbol: i % 2 ? 'AAPL' : 'MSFT',
  structure: 'bull_put',
  realizedCents: pl,
  riskCents: 40000,
  benchmarkCents: 1000,
  alphaCents: pl - 1000,
  grade: 'B',
  tags: [],
  callBucket: 3,
  callConf: 0.7,
  callActual: 3,
  brier: null,
  regime: { vix: 18, ivr: 45, trend: 0.1, adx: 22, earnings: false },
  ...extra,
});

const rows = [
  t(1, 10000),
  t(2, -5000, { tags: ['held_past_stop'] }),
  t(3, 20000),
  t(4, -15000, { callActual: 1, tags: ['held_past_stop', 'oversized'] }),
  t(5, 5000, {
    structure: 'iron_condor',
    regime: { vix: 30, ivr: 70, trend: -0.2, adx: 35, earnings: true },
  }),
];

describe('stats', () => {
  it('computes the headline numbers', () => {
    const s = summarize(rows);
    expect(s.trades).toBe(5);
    expect(s.wins).toBe(3);
    expect(s.winRate).toBeCloseTo(0.6, 12);
    expect(s.totalCents).toBe(15000);
    expect(s.expectancyCents).toBe(3000);
    expect(s.avgWinCents).toBeCloseTo(35000 / 3, 9);
    expect(s.avgLossCents).toBe(-10000);
    expect(s.profitFactor).toBeCloseTo(35000 / 20000, 12);
    expect(s.alphaCents).toBe(15000 - 5000);
    expect(s.maxDrawdownCents).toBe(15000);
    expect(s.bestCents).toBe(20000);
    expect(s.worstCents).toBe(-15000);
    expect(summarize([]).profitFactor).toBeNull();
    expect(summarize([t(1, 100)]).profitFactor).toBeNull();
  });

  it('breaks results down by structure, ticker and regime', () => {
    const byStructure = breakdown(rows, 'structure');
    expect(byStructure[0]).toMatchObject({ key: 'bull_put' });
    expect(byStructure[0].summary.trades).toBe(4);
    expect(
      breakdown(rows, 'symbol')
        .map((b) => b.key)
        .sort(),
    ).toEqual(['AAPL', 'MSFT']);
    const vix = breakdown(rows, 'vix').map((b) => b.key);
    expect(vix).toContain('VIX > 25 (stressed)');
    expect(breakdown(rows, 'ivr').map((b) => b.key)).toContain('IV rank > 60');
    expect(
      breakdown(rows, 'trend')
        .map((b) => b.key)
        .sort(),
    ).toEqual(['Downtrend', 'Uptrend']);
    expect(
      breakdown(rows, 'earnings')
        .map((b) => b.key)
        .sort(),
    ).toEqual(['Earnings inside', 'No earnings']);
    expect(breakdown(rows, 'desk')[0].key).toBe('verticals');
  });

  it('measures calibration from recorded calls', () => {
    const c = calibration(rows);
    expect(c.calls).toBe(5);
    expect(c.points.find((p) => p.confidence === 0.7)).toMatchObject({ n: 5, hitRate: 0.8 });
    expect(c.meanBrier).toBeGreaterThan(0);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(c.grade);
  });

  it('draws the equity curve against the benchmark', () => {
    const e = equityCurve(rows);
    expect(e.map((p) => p.cumCents)).toEqual([10000, 5000, 25000, 10000, 15000]);
    expect(e[4].benchCents).toBe(5000);
    expect(e[4].alphaCents).toBe(10000);
  });

  it('tracks mistake tags over blocks of trades', () => {
    const m = mistakeTrends(rows, 2);
    expect(m.blocks.map((b) => b.n)).toEqual([2, 2, 1]);
    expect(m.rates.held_past_stop).toEqual([0.5, 0.5, 0]);
    expect(m.rates.oversized).toEqual([0, 0.5, 0]);
  });

  it('exports CSV that Excel reads (BOM, CRLF, quoted fields)', () => {
    const csv = toCsv([t(1, 12345, { tags: ['a', 'b'], symbol: 'X,"Y"' })]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0].split(',')[0]).toBe('Closed');
    expect(lines[1]).toContain('123.45');
    expect(lines[1]).toContain('"X,""Y"""');
    expect(lines[1]).toContain('a; b');
    expect(lines).toHaveLength(3);
  });
});
