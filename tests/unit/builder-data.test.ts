import { describe, expect, it } from 'vitest';
import { freshness } from '../../src/engine/market/freshness';
import { BundleSource, type MarketBundle } from '../../src/engine/market/bundleSource';
import { MarketView } from '../../src/engine/market/view';
import { openTransform } from '../../src/engine/market/transform';
import { LookaheadError } from '../../src/engine/market/source';
import type { Bar, Chain } from '../../src/engine/market/types';
import { BUILDER_TICKERS } from '../../src/content/builderTickers';
import { CANDIDATES } from '../../data-pipeline/dolt/tickers';

describe('Trade Builder data freshness', () => {
  it('live today, current through the last close, or so many trading days old', () => {
    // 2026-10-05 is a Monday.
    expect(freshness('2026-10-05', '2026-10-05', false, true).state).toBe('live');
    // Before Monday's close, Friday's close is the latest one.
    expect(freshness('2026-10-02', '2026-10-05', false, false).state).toBe('current');
    // After Monday's close, Friday's data is one trading day behind.
    const f = freshness('2026-10-02', '2026-10-05', true, false);
    expect(f.state).toBe('stale');
    expect(f.daysOld).toBe(1);
    expect(f.text).toMatch(/Out of date: this data ends 2026-10-02, 1 trading day behind/);
    // A week-old file over a weekend counts trading days, not calendar days.
    expect(freshness('2026-09-25', '2026-10-05', true, false).daysOld).toBe(6);
    // On a Saturday, Friday's close is current.
    expect(freshness('2026-10-02', '2026-10-03', true, false).state).toBe('current');
  });
});

describe('the Trade Builder ticker list', () => {
  it('adds 25 new, unique tickers that the game did not already carry', () => {
    expect(BUILDER_TICKERS).toHaveLength(25);
    const syms = BUILDER_TICKERS.map((t) => t.symbol);
    expect(new Set(syms).size).toBe(25);
    const game = CANDIDATES.filter((c) => c.group !== 'builder').map((c) => c.symbol);
    for (const s of syms) expect(game, s).not.toContain(s);
    // Schwab pulls every candidate, so the builder's tickers are in the pull list.
    for (const s of syms) expect(CANDIDATES.some((c) => c.symbol === s)).toBe(true);
  });
});

function bars(n: number, last: string): Bar[] {
  const out: Bar[] = [];
  const d = new Date(`${last}T00:00:00Z`);
  while (out.length < n) {
    const iso = d.toISOString().slice(0, 10);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6)
      out.unshift({ date: iso, open: 100, high: 101, low: 99, close: 100, volume: 1, source: 'real' });
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

describe('the Trade Builder market', () => {
  const chain: Chain = {
    symbol: 'QQQ',
    date: '2026-10-02',
    spot: 100,
    source: 'real',
    quotes: [
      {
        expiration: '2026-10-16',
        strike: 95,
        right: 'P',
        bid: 0.5,
        ask: 0.6,
        iv: 0.2,
        delta: -0.2,
        gamma: 0.02,
        theta: -0.03,
        vega: 0.05,
        rho: 0,
        source: 'real',
      },
    ],
  };
  const bundle: MarketBundle = {
    symbol: 'QQQ',
    name: 'Invesco QQQ',
    sector: 'Index ETF',
    isEtf: true,
    bars: bars(300, '2026-10-02'),
    chain,
    asOf: '2026-10-02',
    vol: [],
    earnings: [],
  };

  it('serves a loaded ticker through the regular, time-gated MarketView', async () => {
    const src = new BundleSource(0.04);
    src.add(bundle);
    expect((await src.meta()).lastDate).toBe('2026-10-02');
    expect((await src.symbols()).map((s) => s.symbol)).toEqual(['QQQ']);
    const view = await MarketView.open({
      source: src,
      transform: openTransform('QQQ', '2026-10-02'),
      window: {
        id: -1,
        symbol: 'QQQ',
        historyStart: '2025-01-01',
        entryDate: '2026-10-02',
        endDate: '2026-10-02',
        forwardDays: 0,
        recent: true,
        weight: 0,
        tags: {
          adx: 0,
          trendSlope: 0,
          vix: 0,
          ivr: 0,
          hasEarnings: false,
          hasExDiv: false,
          hasFomc: false,
          maxGapAtr: 0,
          spreadPct: 0,
          spreadDecile: 0,
        },
      },
    });
    expect(view.now).toBe('2026-10-02');
    expect(view.spot()).toBe(100);
    expect((await view.loadChain())?.quotes).toHaveLength(1);
    // The view still refuses anything past its day.
    expect(() => view.chainAt('2026-10-09')).toThrow(LookaheadError);
    // A chain is only served for the day it belongs to.
    expect(await src.chain('QQQ', '2026-10-01')).toBeNull();
  });
});
