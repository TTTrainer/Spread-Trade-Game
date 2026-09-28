import { describe, expect, it } from 'vitest';
import {
  constantMaturityIv,
  enrichEarnings,
  liquidityScore,
  modelMissingDay,
  normalizeQuote,
  parseTiming,
  straddleMid,
  volSeries,
} from '../../data-pipeline/lib/derived';
import { selectTickers, type CandidateScore } from '../../data-pipeline/dolt/tickers';
import { parseVixCsv } from '../../data-pipeline/vix';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { nextTradingDay } from '../../src/engine/calendar';

const sim = new SyntheticSource({ symbols: ['HLXR'] });

describe('pipeline derived data', () => {
  it('models a missing day from the prior real chain only, labeled modeled', async () => {
    const prior = await sim.chain('HLXR', '2025-03-03');
    const actual = await sim.chain('HLXR', '2025-03-04');
    if (!prior || !actual) throw new Error('missing chains');
    const modeled = modelMissingDay({
      symbol: 'HLXR',
      date: '2025-03-04',
      spot: actual.spot,
      prior,
      rate: 0.04,
      divYield: 0.005,
      weeklies: true,
    });
    expect(modeled.source).toBe('modeled');
    expect(modeled.quotes.every((q) => q.source === 'modeled' && q.ask >= q.bid)).toBe(true);
    // Its ATM IV should be close to the prior day's, not magically equal to the next day's.
    const ivPrior = constantMaturityIv(prior, 30) as number;
    const ivModeled = constantMaturityIv(modeled, 30) as number;
    expect(Math.abs(ivModeled - ivPrior)).toBeLessThan(0.03);
  });

  it('computes IV rank from trailing data only', async () => {
    const bars = await sim.bars('HLXR', '2023-01-01', '2024-12-31');
    const iv = new Map(bars.map((b, i) => [b.date, 0.2 + 0.1 * Math.sin(i / 20)] as const));
    const full = volSeries(bars, iv);
    const cut = volSeries(bars.slice(0, 300), iv);
    // Values up to day 300 are identical whether or not later data exists.
    expect(full.slice(0, 300)).toEqual(cut);
    expect(full[299].ivr).toBeGreaterThanOrEqual(0);
    expect(full[299].ivr).toBeLessThanOrEqual(100);
  });

  it('enriches earnings with gap, move, implied move and IV crush', async () => {
    const events = await sim.earnings('HLXR', '2024-01-01', '2024-12-31');
    const bars = await sim.bars('HLXR', '2023-06-01', '2025-01-31');
    const chains = new Map<string, NonNullable<Awaited<ReturnType<typeof sim.chain>>>>();
    for (const e of events) {
      for (const d of [e.date, nextTradingDay(e.date)]) {
        const c = await sim.chain('HLXR', d);
        if (c) chains.set(d, c);
      }
      const idx = bars.findIndex((b) => b.date === e.reactionDate);
      const prev = bars[idx - 1].date;
      const pc = await sim.chain('HLXR', prev);
      if (pc) chains.set(prev, pc);
    }
    const out = enrichEarnings(
      events.map((e) => ({
        symbol: 'HLXR',
        date: e.date,
        when: e.timing === 'BMO' ? 'Before market open' : 'After market close',
        estimate: e.estimate,
        actual: e.actual,
      })),
      bars,
      (d) => chains.get(d) ?? null,
      () => 0.04,
    );
    for (let i = 0; i < out.length; i++) {
      expect(out[i].reactionDate).toBe(events[i].reactionDate);
      expect(out[i].movePct).toBeCloseTo(events[i].movePct as number, 1);
      expect(out[i].impliedMovePct).not.toBeNull();
      expect(out[i].ivAfter as number).toBeLessThan(out[i].ivBefore as number);
    }
    expect(parseTiming('Before market open')).toBe('BMO');
    expect(parseTiming('After market close')).toBe('AMC');
    expect(parseTiming(null)).toBe('UNK');
  });

  it('scores liquidity and straddles', async () => {
    const c = await sim.chain('HLXR', '2025-05-01');
    if (!c) throw new Error('no chain');
    const l = liquidityScore([c]);
    expect(l).toBeGreaterThan(0);
    expect(l).toBeLessThan(0.2);
    const exp = c.quotes[0].expiration;
    expect(straddleMid(c, exp)).toBeGreaterThan(0);
  });

  it('normalizes quotes: recomputes greeks from IV, solves IV when missing, drops junk', () => {
    const base = {
      expiration: '2025-06-20',
      strike: 100,
      right: 'C' as const,
      bid: 4.9,
      ask: 5.1,
      iv: 0,
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
      source: 'real' as const,
    };
    const n = normalizeQuote(base, '2025-05-20', 100, 0.04, 0);
    expect(n?.iv).toBeGreaterThan(0.2);
    expect(n?.delta).toBeGreaterThan(0.4);
    expect(normalizeQuote({ ...base, bid: 6, ask: 5 }, '2025-05-20', 100, 0.04, 0)).toBeNull();
  });

  it('parses the Cboe VIX csv', () => {
    const rows = parseVixCsv(
      'DATE,OPEN,HIGH,LOW,CLOSE\n01/02/1990,17.24,17.24,17.24,17.24\n03/15/2024,14.1,14.9,13.8,14.4\n',
    );
    expect(rows).toEqual([
      { date: '1990-01-02', open: 17.24, high: 17.24, low: 17.24, close: 17.24 },
      { date: '2024-03-15', open: 14.1, high: 14.9, low: 13.8, close: 14.4 },
    ]);
  });

  it('selects tickers by the plan rule', () => {
    const mk = (symbol: string, liquidity: number, ivLevel: number, present = true): CandidateScore => ({
      symbol,
      present,
      chainFirst: '2019-02-01',
      chainLast: '2026-09-25',
      chainDays: present ? 1500 : 0,
      barFirst: '2018-01-02',
      liquidity,
      ivLevel,
    });
    const scores = [
      ...['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'].map((s) => mk(s, 0.02, 0.3)),
      ...['AMD', 'NFLX', 'AVGO', 'JPM', 'BA', 'UBER', 'COST', 'ORCL', 'CRM', 'DIS'].map((s, i) =>
        mk(s, 0.02 + i * 0.01, 0.3),
      ),
      mk('PLTR', 0.05, 0.7),
      mk('SMCI', 0.08, 0.9),
      mk('COIN', 0.06, 0.8),
      mk('MU', 0.03, 0.45),
      mk('GME', 0.5, 1.2),
      mk('HOOD', 0.07, 0.75),
      mk('SPY', 0.01, 0.15),
      mk('DIA', 0.02, 0.14),
    ];
    const sel = selectTickers(scores).map((s) => s.symbol);
    expect(
      sel.filter((s) => ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'].includes(s)),
    ).toHaveLength(7);
    expect(sel).toContain('AMD');
    expect(sel).not.toContain('DIS'); // least liquid of the liquid group is cut
    expect(sel).not.toContain('GME'); // too wide to trade
    expect(sel).toContain('SMCI');
    expect(sel).toContain('SPY');
    expect(sel.length).toBeGreaterThanOrEqual(19);
    expect(sel.length).toBeLessThanOrEqual(22);
  });
});
