import { describe, expect, it } from 'vitest';
import { diffDays } from '../../src/engine/calendar';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';

const src = new SyntheticSource({ symbols: ['MKTX', 'HLXR', 'QSLC', 'MEMX', 'ORGR'] });

describe('SIM market', () => {
  it('is deterministic from its seed', async () => {
    const other = new SyntheticSource({ symbols: ['HLXR'] });
    const a = await src.bars('HLXR', '2024-01-01', '2024-02-01');
    const b = await other.bars('HLXR', '2024-01-01', '2024-02-01');
    expect(a).toEqual(b);
    const c1 = await src.chain('HLXR', '2024-03-05');
    const c2 = await other.chain('HLXR', '2024-03-05');
    expect(c1).toEqual(c2);
  });

  it('prices sane chains', async () => {
    for (const sym of ['MKTX', 'HLXR', 'MEMX']) {
      const c = await src.chain(sym, '2025-05-06');
      expect(c).not.toBeNull();
      if (!c) continue;
      expect(c.quotes.length).toBeGreaterThan(100);
      const exps = new Set(c.quotes.map((q) => q.expiration));
      expect(exps.size).toBeGreaterThanOrEqual(6);
      for (const q of c.quotes) {
        expect(q.bid).toBeGreaterThanOrEqual(0);
        expect(q.ask).toBeGreaterThanOrEqual(q.bid);
        expect(q.iv).toBeGreaterThan(0);
        expect(q.iv).toBeLessThan(5);
        const dte = diffDays(c.date, q.expiration);
        expect(dte).toBeGreaterThanOrEqual(1);
        expect(dte).toBeLessThanOrEqual(70);
        if (q.right === 'C') expect(q.delta).toBeGreaterThanOrEqual(0);
        else expect(q.delta).toBeLessThanOrEqual(0);
        expect(Math.abs(q.strike / c.spot - 1)).toBeLessThanOrEqual(0.301);
      }
    }
  });

  it('has an implied volatility premium and earnings IV crush', async () => {
    const vol = await src.vol('HLXR', '2019-06-01', '2026-09-25');
    const ivs = vol.filter((v) => v.iv30 !== null && v.hv20 !== null);
    const premium = ivs.filter((v) => (v.iv30 as number) > (v.hv20 as number)).length / ivs.length;
    expect(premium).toBeGreaterThan(0.55);
    const events = await src.earnings('HLXR', '2019-06-01', '2026-06-01');
    const crushed = events.filter(
      (e) => e.ivBefore !== null && e.ivAfter !== null && e.ivAfter < e.ivBefore,
    ).length;
    expect(crushed / events.length).toBeGreaterThan(0.8);
  });

  it('never deals a window that spans a split', async () => {
    const splits = await src.splits('QSLC');
    expect(splits.length).toBe(1);
    const wins = await src.windows({ symbols: ['QSLC'] });
    expect(wins.length).toBeGreaterThan(100);
    for (const w of wins)
      expect(w.historyStart < splits[0].exDate && splits[0].exDate <= w.endDate).toBe(false);
  });

  it('builds windows with a year of history and weighted toward recent years', async () => {
    const wins = src.allWindows();
    const recentWeight = wins.filter((w) => w.recent).reduce((a, w) => a + w.weight, 0);
    const total = wins.reduce((a, w) => a + w.weight, 0);
    expect(recentWeight / total).toBeCloseTo(0.75, 5);
    const days = await src.tradingDays(wins[0].historyStart, wins[0].entryDate);
    expect(days.length).toBeGreaterThanOrEqual(253);
  });

  it('quotes contracts consistently with the chain', async () => {
    const c = await src.chain('ORGR', '2025-02-03');
    if (!c) throw new Error('no chain');
    const pick = c.quotes[Math.floor(c.quotes.length / 2)];
    const rows = await src.quotes('ORGR', [pick], '2025-02-03', '2025-02-10');
    expect(rows[0].bid).toBe(pick.bid);
    expect(rows[0].ask).toBe(pick.ask);
    expect(rows.length).toBe(6);
  });
});
