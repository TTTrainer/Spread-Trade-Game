import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/calendar';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { blindTransform, openTransform } from '../../src/engine/market/transform';
import type { Bar, EarningsEvent } from '../../src/engine/market/types';
import { MarketView } from '../../src/engine/market/view';
import { buildBrief, briefFromView, type BriefInput } from '../../src/engine/news/brief';
import { Rng } from '../../src/engine/rng';

const base = new SyntheticSource({ symbols: ['HLXR', 'ORGR', 'MEMX', 'MKTX'] });

/** Business-day bars following a path of daily returns, starting at 100. */
function barsFrom(returns: number[], start = '2021-01-04'): Bar[] {
  const out: Bar[] = [];
  let px = 100;
  let d = start;
  for (const r of [0, ...returns]) {
    px *= 1 + r;
    out.push({
      date: d,
      open: px,
      high: px * 1.005,
      low: px * 0.995,
      close: px,
      volume: 1_000_000,
      source: 'real',
    });
    d = addDays(d, 1);
    while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = addDays(d, 1);
  }
  return out;
}

function input(bars: Bar[], over: Partial<BriefInput> = {}): BriefInput {
  return {
    now: bars[bars.length - 1].date,
    symbol: 'QFUJ',
    bars,
    benchmark: [],
    vix: [],
    vol: [],
    upcomingEarnings: [],
    pastEarnings: [],
    dividends: [],
    macro: [],
    mode: 'blind',
    ...over,
  };
}

describe('news brief: street read', () => {
  it('reads a steady climb as bullish and a steady slide as bearish, with reasons', () => {
    const wobble = (i: number) => (i % 3 === 0 ? -0.004 : 0);
    const up = buildBrief(input(barsFrom(Array.from({ length: 300 }, (_, i) => 0.003 + wobble(i)))));
    expect(up.street.lean).toBeGreaterThan(0);
    expect(up.street.reasons.length).toBeGreaterThan(0);
    expect(up.street.reasons.length).toBeLessThanOrEqual(3);
    expect(up.trend.join(' ')).toMatch(/Uptrend/);
    const down = buildBrief(input(barsFrom(Array.from({ length: 300 }, (_, i) => -0.003 - wobble(i)))));
    expect(down.street.lean).toBeLessThan(0);
    expect(down.trend.join(' ')).toMatch(/Downtrend/);
    expect(down.street.label).toMatch(/BEARISH/);
  });

  it('turns an earnings reaction into a headline and a reason', () => {
    const bars = barsFrom(Array.from({ length: 280 }, (_, i) => (i === 270 ? 0.12 : 0.0002)));
    const day = bars[271].date;
    const ern: EarningsEvent = {
      symbol: 'QFUJ',
      date: bars[270].date,
      timing: 'AMC',
      reactionDate: day,
      estimate: 1,
      actual: 1.3,
      surprisePct: 30,
      gapPct: 11,
      movePct: 12,
      impliedMovePct: 5,
      ivBefore: 0.6,
      ivAfter: 0.35,
    };
    const b = buildBrief(input(bars, { pastEarnings: [ern] }));
    const h = b.headlines.find((x) => x.kind === 'earnings');
    expect(h?.text).toContain('QFUJ');
    expect(h?.tone).toBe('up');
    expect(h?.ago).toBe(bars.length - 1 - 271);
    expect(b.street.reasons.some((r) => /earnings/.test(r.text) && r.weight > 0)).toBe(true);
    // Real companies by name get the plain facts, never the satire.
    const open = buildBrief(input(bars, { pastEarnings: [ern], mode: 'open', symbol: 'AAPL' }));
    expect(open.headlines.find((x) => x.kind === 'earnings')?.text).toMatch(/^AAPL reported earnings/);
  });

  it('spots a winning streak that is still running', () => {
    const bars = barsFrom([
      ...Array.from({ length: 60 }, (_, i) => (i % 2 ? 0.004 : -0.004)),
      0.01,
      0.01,
      0.01,
      0.01,
      0.01,
      0.01,
    ]);
    const b = buildBrief(input(bars));
    const s = b.headlines.find((x) => x.kind === 'streak');
    expect(s?.ago).toBe(0);
    expect(s?.text).toMatch(/6/);
  });

  it('shows the earnings date exactly only with the detail unlocked', () => {
    const bars = barsFrom(Array.from({ length: 60 }, () => 0.001));
    const now = bars[bars.length - 1].date;
    const upcomingEarnings = [
      { symbol: 'QFUJ', date: addDays(now, 17), timing: 'AMC' as const, reactionDate: addDays(now, 18) },
    ];
    const full = buildBrief(input(bars, { upcomingEarnings }));
    expect(full.upcoming[0].text).toBe('Earnings in 17 days, after the close');
    const coarse = buildBrief(
      input(bars, { upcomingEarnings, access: { earningsDetail: false, ivDetail: false } }),
    );
    expect(coarse.upcoming[0].text).toBe('Earnings in about 2 weeks');
    expect(coarse.upcoming[0].text).not.toMatch(/17/);
  });

  it('is deterministic and never quotes a dollar price', () => {
    const bars = barsFrom(Array.from({ length: 300 }, (_, i) => Math.sin(i / 7) * 0.02));
    const a = buildBrief(input(bars));
    const b = buildBrief(input(bars));
    expect(a).toEqual(b);
    const text = JSON.stringify(a);
    expect(text).not.toMatch(/\$\d/);
  });
});

describe('news brief: no lookahead', () => {
  it('matches a brief built from a window that ends today, over random windows and days', async () => {
    const rng = new Rng('brief-lookahead');
    const windows = base.allWindows();
    for (let trial = 0; trial < 12; trial++) {
      const w = rng.pick(windows);
      const steps = rng.int(0, 8);
      const blind = rng.chance(0.5);
      const transform = blind
        ? blindTransform(w.symbol, w.entryDate, 100, new Rng(`t${trial}`))
        : openTransform(w.symbol, w.entryDate);
      const full = await MarketView.open({ source: base, window: w, transform, benchmark: 'MKTX' });
      for (let i = 0; i < steps && !full.atEnd; i++) await full.advance();
      const now = full.now;
      const a = briefFromView(full, { mode: blind ? 'blind' : 'open' });
      // A window that simply stops today cannot know anything about the days after it.
      const cut = { ...w, endDate: now, forwardDays: full.dayIndex };
      const short = await MarketView.open({
        source: base,
        window: cut,
        transform,
        benchmark: 'MKTX',
        startOffset: full.dayIndex,
      });
      expect(short.now).toBe(now);
      const b = briefFromView(short, { mode: blind ? 'blind' : 'open' });
      expect(a).toEqual(b);
      expect(a.asOf).toBe(now);
      for (const h of a.headlines) expect(h.ago).toBeGreaterThanOrEqual(0);
      for (const u of a.upcoming) expect(u.inDays).toBeGreaterThanOrEqual(0);
      if (blind) expect(JSON.stringify(a)).not.toContain(w.symbol);
    }
  });
});
