import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/calendar';
import { DIVIDEND_DECLARE_DAYS, GATE_RULES, type SourceMethod } from '../../src/engine/market/gate';
import { rsi } from '../../src/engine/market/indicators';
import { LookaheadError, type MarketDataSource } from '../../src/engine/market/source';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { blindTransform, openTransform } from '../../src/engine/market/transform';
import { MarketView } from '../../src/engine/market/view';
import { Rng } from '../../src/engine/rng';

const base = new SyntheticSource({ symbols: ['HLXR', 'ORGR', 'MEMX', 'MKTX'] });

interface Call {
  method: SourceMethod;
  args: unknown[];
}

/** A source that records every request so the test can prove none reached past the clock. */
function spy(src: MarketDataSource): { source: MarketDataSource; calls: Call[] } {
  const calls: Call[] = [];
  const source = new Proxy(src, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver) as unknown;
      if (typeof v !== 'function') return v;
      return (...args: unknown[]) => {
        calls.push({ method: prop as SourceMethod, args });
        return (v as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { source, calls };
}

function assertNoFutureRequests(calls: Call[], now: string): void {
  for (const c of calls) {
    const rule = GATE_RULES[c.method];
    if (!rule) continue;
    const limit = rule.aheadDays ? addDays(now, DIVIDEND_DECLARE_DAYS) : now;
    for (const i of rule.dateArgs) {
      const d = c.args[i];
      if (typeof d === 'string') expect(d <= limit, `${c.method} asked for ${d} at ${now}`).toBe(true);
    }
  }
}

describe('MarketView time gate (property tests)', () => {
  it('never requests or returns data after the clock, over random windows and actions', async () => {
    const rng = new Rng('lookahead-property');
    const windows = base.allWindows();
    for (let trial = 0; trial < 25; trial++) {
      const w = rng.pick(windows);
      const { source, calls } = spy(base);
      const view = await MarketView.open({
        source,
        window: w,
        transform: openTransform(w.symbol, w.entryDate),
        benchmark: 'MKTX',
      });
      assertNoFutureRequests(calls, view.now);
      const chain = await view.loadChain();
      const keys = rng.shuffle(chain.quotes).slice(0, 3);
      await view.track(keys);
      const steps = rng.int(0, 40);
      for (let s = 0; s < steps; s++) {
        calls.length = 0;
        const moved = await view.advance();
        assertNoFutureRequests(calls, view.now);
        if (!moved) break;
        if (rng.chance(0.2)) {
          calls.length = 0;
          await view.loadChain();
          assertNoFutureRequests(calls, view.now);
        }
      }
      const now = view.now;
      const bars = view.bars();
      expect(bars[bars.length - 1].date).toBe(now);
      expect(bars.every((b) => b.date <= now)).toBe(true);
      expect(view.vix().every((v) => v.date <= now)).toBe(true);
      expect(view.vol().every((v) => v.date <= now)).toBe(true);
      expect(view.fundamentals().every((f) => f.reportDate <= now)).toBe(true);
      expect(view.benchmarkBars().every((b) => b.date <= now)).toBe(true);
      expect(view.dividends().every((d) => d.exDate <= addDays(now, DIVIDEND_DECLARE_DAYS))).toBe(true);
      const e = view.earnings();
      expect(e.past.every((x) => x.reactionDate <= now)).toBe(true);
      for (const u of e.upcoming) {
        expect(u.reactionDate > now).toBe(true);
        expect(Object.keys(u).sort()).toEqual(['date', 'reactionDate', 'symbol', 'timing']);
      }
      // Indicators on the view's bars equal indicators on the true history cut at today.
      const truth = await base.bars(w.symbol, w.historyStart, now);
      expect(rsi(bars.map((b) => b.close))).toEqual(rsi(truth.map((b) => b.close)));
      // Asking for tomorrow throws.
      const tomorrow = view.upcomingTradingDays()[0];
      if (tomorrow) {
        expect(() => view.chainAt(tomorrow)).toThrow(LookaheadError);
        expect(() => view.quote(keys[0], tomorrow)).toThrow(LookaheadError);
        await expect(view.history(keys[0], w.entryDate, tomorrow)).rejects.toThrow(LookaheadError);
      }
    }
  });

  it('shows scheduled events ahead but their outcomes only on the day', async () => {
    const w = base.allWindows().find((x) => x.symbol === 'HLXR' && x.tags.hasEarnings) as NonNullable<
      ReturnType<typeof base.allWindows>[number]
    >;
    const view = await MarketView.open({
      source: base,
      window: w,
      transform: openTransform(w.symbol, w.entryDate),
    });
    const upcoming = view.earnings().upcoming.find((u) => u.reactionDate <= w.endDate);
    expect(upcoming).toBeDefined();
    if (!upcoming) return;
    expect(view.earnings().past.some((p) => p.date === upcoming.date)).toBe(false);
    while (view.now < upcoming.reactionDate) await view.advance();
    const past = view.earnings().past.find((p) => p.date === upcoming.date);
    expect(past).toBeDefined();
    expect(past?.movePct).not.toBeNull();
  });

  it('applies blind transforms consistently to price, chain and dates', async () => {
    const w = base.allWindows().find((x) => x.symbol === 'HLXR') as NonNullable<
      ReturnType<typeof base.allWindows>[number]
    >;
    const open = await MarketView.open({
      source: base,
      window: w,
      transform: openTransform(w.symbol, w.entryDate),
    });
    const probe = await base.bars(w.symbol, w.entryDate, w.entryDate);
    const t = blindTransform(w.symbol, w.entryDate, probe[0].close, new Rng('blind'));
    const blind = await MarketView.open({ source: base, window: w, transform: t });
    expect(t.scale).not.toBe(1);
    expect(blind.publicWindow.displaySymbol).not.toBe(w.symbol);
    expect(blind.spot()).toBeCloseTo(open.spot() * t.scale, 6);
    const c0 = await open.loadChain();
    const c1 = await blind.loadChain();
    expect(c1.symbol).toBe(t.displaySymbol);
    expect(c1.spot).toBeCloseTo(c0.spot * t.scale, 6);
    const q0 = c0.quotes[40];
    const q1 = c1.quotes[40];
    expect(q1.strike).toBeCloseTo(q0.strike * t.scale, 6);
    expect(q1.bid).toBeCloseTo(q0.bid * t.scale, 6);
    expect(q1.iv).toBe(q0.iv);
    expect(q1.delta).toBe(q0.delta);
    // A quote looked up by its displayed key maps back to the same real contract.
    expect(blind.quote(q1)?.ask).toBeCloseTo(q0.ask * t.scale, 6);
    expect(blind.dayLabel()).toBe('Day 1');
    await blind.advance();
    expect(blind.dayLabel()).toBe('Day 2');
    expect(blind.dayLabel(w.historyStart)).toMatch(/^Day -\d+$/);
  });

  it('refuses chains on flipped charts', async () => {
    const w = base.allWindows()[10];
    const t = { ...openTransform(w.symbol, w.entryDate), flipBars: true };
    const view = await MarketView.open({ source: base, window: w, transform: t });
    await expect(view.loadChain()).rejects.toThrow();
    const truth = await base.bars(w.symbol, w.historyStart, w.entryDate);
    const up = truth[truth.length - 1].close > truth[0].close;
    const flipped = view.bars();
    expect(flipped[flipped.length - 1].close > flipped[0].close).toBe(!up);
  });
});
