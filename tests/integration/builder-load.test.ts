import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ISODate } from '../../src/engine/calendar';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { builderLoad } from '../../data-pipeline/schwab/builderLoad';
import { INDEX_CHAIN_STEPS, schwabPull, type SchwabMarketApi } from '../../data-pipeline/schwab/pull';
import { SchwabStore } from '../../data-pipeline/schwab/store';
import type { CboeApi } from '../../data-pipeline/live/cboe';
import type { Bar, Chain } from '../../src/engine/market/types';
import { afterClose, fakeSchwab } from '../helpers/fakeSchwab';

const occ = (root: string, exp: string, right: 'C' | 'P', strike: number) =>
  `${root}${exp.slice(2).replaceAll('-', '')}${right}${String(Math.round(strike * 1000)).padStart(8, '0')}`;

/** Cboe's delayed-quotes feed for one ticker, built from a synthetic market's day. */
function fakeCboe(
  market: SyntheticSource,
  symbol: string,
  day: ISODate,
  time: string,
): CboeApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    options: async (sym) => {
      calls.push(`options:${sym}`);
      const c = (await market.chain(symbol, day)) as Chain;
      const [b] = (await market.bars(symbol, day, day)) as Bar[];
      return {
        data: {
          current_price: b.close,
          open: b.open,
          high: b.high,
          low: b.low,
          volume: b.volume,
          last_trade_time: `${day}T${time}:00`,
          options: c.quotes.map((q) => ({
            option: occ(sym, q.expiration, q.right, q.strike),
            bid: q.bid,
            ask: q.ask,
            iv: q.iv,
          })),
        },
      };
    },
    history: async (sym) => {
      calls.push(`history:${sym}`);
      const bars = await market.bars(symbol, '2018-01-02', day);
      return { data: bars.map((b) => ({ ...b, open: String(b.open), close: String(b.close) })) };
    },
  };
}

describe("the Trade Builder's data for a ticker", () => {
  const src = new SyntheticSource({ lastDate: '2021-06-30', symbols: ['MKTX', 'HLXR'] });
  const today: ISODate = '2021-06-01';
  const fake = fakeSchwab(src, () => today);

  it('asks Schwab first: two years of prices and today’s real chain', async () => {
    const r = await builderLoad({
      symbol: 'SPY',
      now: new Date(`${today}T15:00:00Z`),
      api: fake.api,
      store: null,
      game: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe('schwab-live');
    expect(r.live).toBe(true);
    expect(r.modeledChain).toBe(false);
    expect(r.bundle.asOf).toBe(today);
    expect(r.bundle.chain?.source).toBe('real');
    expect(r.bundle.chain?.quotes.length).toBeGreaterThan(20);
    // Greeks are worked out for the real quotes.
    expect(r.bundle.chain?.quotes.some((q) => Math.abs(q.delta) > 0)).toBe(true);
    // About two years of daily bars, nothing past today.
    expect(r.bundle.bars[0].date >= '2019-05-01').toBe(true);
    expect(r.bundle.bars.at(-1)?.date).toBe(today);
    expect(r.bundle.name).toMatch(/SPDR/);
  });

  it('falls back to saved data when Schwab is unreachable, and says why', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stg-builder-'));
    const storePath = join(dir, 'schwab.db');
    await schwabPull({ storePath, api: fake.api, symbols: ['SPY'], now: afterClose('2021-05-28') });
    const store = new SchwabStore(storePath, { readOnly: true });
    const broken = {
      priceHistory: async () => {
        throw new Error('Schwab refused the login (401)');
      },
      chain: async () => null,
    };
    try {
      const r = await builderLoad({ symbol: 'SPY', now: afterClose(today), api: broken, store, game: null });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.source).toBe('schwab-saved');
      expect(r.live).toBe(false);
      expect(r.notes.join(' ')).toMatch(/Couldn't reach Schwab/);
      expect(r.bundle.asOf).toBe('2021-05-28');
      // That close's chain was saved, so it's real.
      expect(r.modeledChain).toBe(false);
    } finally {
      store.close();
    }
  });

  it('uses the game’s own data for tickers it carries, modeling the chain only when none is stored', async () => {
    const r = await builderLoad({
      symbol: 'MKTX',
      now: afterClose('2021-06-30'),
      api: null,
      store: null,
      game: src,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe('game');
    expect(r.bundle.asOf).toBe('2021-06-30');
    expect(r.bundle.chain?.quotes.length).toBeGreaterThan(20);
  });

  it('loads an index from Schwab as $SPX, a slice of its chain at a time, and says it settles in cash', async () => {
    const asked: string[] = [];
    // Schwab turns down the first, widest index request; the next, narrower one comes back.
    const fussy: SchwabMarketApi = {
      priceHistory: fake.api.priceHistory,
      chain: async (symbol, from, to, strikeCount) => {
        asked.push(`${symbol}:${strikeCount}:${to}`);
        if ((strikeCount ?? Infinity) > INDEX_CHAIN_STEPS[1].strikes)
          throw new Error('Schwab chains answered 502');
        return fake.api.chain(symbol, from, to, strikeCount);
      },
    };
    const r = await builderLoad({
      symbol: 'SPX',
      now: new Date(`${today}T15:00:00Z`),
      api: fussy,
      store: null,
      game: null,
    });
    expect(asked).toEqual([
      `$SPX:${INDEX_CHAIN_STEPS[0].strikes}:2021-08-10`,
      `$SPX:${INDEX_CHAIN_STEPS[1].strikes}:2021-07-16`,
    ]);
    expect(fake.calls).toContain('history:$SPX:2019-06-02');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe('schwab-live');
    expect(r.bundle.symbol).toBe('SPX');
    expect(r.bundle.name).toBe('S&P 500 Index');
    expect(r.bundle.chain?.source).toBe('real');
    expect(r.notes.join(' ')).toMatch(/settle in cash/);
    // A refused login isn't retried: it fails the same way every time.
    const refused = await builderLoad({
      symbol: 'SPX',
      now: new Date(`${today}T15:00:00Z`),
      api: {
        priceHistory: fake.api.priceHistory,
        chain: async () => {
          asked.push('again');
          throw new Error('Schwab refused the login (401). Connect again in Settings › Data.');
        },
      },
      store: null,
      game: null,
    });
    expect(asked.filter((a) => a === 'again')).toHaveLength(1);
    expect(refused.ok).toBe(false);
  });

  it("without Schwab, Cboe's delayed quotes give today's candle and chain, labeled 15 minutes behind", async () => {
    const day: ISODate = '2021-06-30';
    // The game's data runs through yesterday; Cboe has today so far.
    const game = new SyntheticSource({ lastDate: '2021-06-29', symbols: ['MKTX', 'HLXR'] });
    const cboe = fakeCboe(src, 'MKTX', day, '13:45');
    const r = await builderLoad({
      symbol: 'MKTX',
      now: new Date(`${day}T18:00:00Z`),
      api: null,
      store: null,
      game,
      delayed: cboe,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe('cboe-delayed');
    expect(r.live).toBe(true);
    expect(r.delayedMinutes).toBe(15);
    expect(r.quoteTime).toBe('13:45');
    expect(r.notes.join(' ')).toMatch(/15 minutes behind/);
    expect(r.bundle.asOf).toBe(day);
    expect(r.bundle.chain?.date).toBe(day);
    expect(r.bundle.chain?.source).toBe('real');
    expect(r.modeledChain).toBe(false);
    const [real] = await src.bars('MKTX', day, day);
    expect(r.bundle.bars.at(-1)).toMatchObject({
      date: day,
      open: real.open,
      high: real.high,
      close: real.close,
    });
    expect(r.bundle.bars.at(-2)?.date).toBe('2021-06-29');
    // The saved history reached yesterday, so Cboe's own wasn't needed.
    expect(cboe.calls).toEqual(['options:MKTX']);
  });

  it("with nothing saved, Cboe's daily history fills the chart", async () => {
    const day: ISODate = '2021-06-30';
    const cboe = fakeCboe(src, 'MKTX', day, '15:59');
    const r = await builderLoad({
      symbol: 'NEWCO',
      now: new Date(`${day}T20:30:00Z`),
      api: null,
      store: null,
      game: null,
      delayed: cboe,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(cboe.calls).toEqual(['options:NEWCO', 'history:NEWCO']);
    expect(r.bundle.bars.length).toBeGreaterThan(400);
    expect(r.bundle.bars.at(-1)?.date).toBe(day);
  });

  it("Schwab in real time: today's candle is the session's real open, high and low so far", async () => {
    const day: ISODate = '2021-06-01';
    const live: SchwabMarketApi = {
      ...fake.api,
      chain: async (...a: Parameters<SchwabMarketApi['chain']>) => ({
        ...((await fake.api.chain(...a)) as object),
        underlying: {
          last: 420.5,
          openPrice: 418,
          highPrice: 421,
          lowPrice: 417.25,
          totalVolume: 9000,
          tradeTime: Date.parse(`${day}T15:30:12Z`),
          delayed: false,
        },
      }),
    };
    const r = await builderLoad({
      symbol: 'SPY',
      now: new Date(`${day}T15:31:00Z`),
      api: live,
      store: null,
      game: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe('schwab-live');
    expect(r.delayedMinutes).toBe(0);
    expect(r.quoteTime).toBe('11:30');
    expect(r.bundle.bars.at(-1)).toMatchObject({
      date: day,
      open: 418,
      high: 421,
      low: 417.25,
      close: 420.5,
    });
    expect(r.bundle.bars.filter((b) => b.date === day)).toHaveLength(1);
    expect(r.bundle.chain?.spot).toBe(420.5);
  });

  it('says plainly when a ticker has no data at all', async () => {
    const r = await builderLoad({ symbol: 'QQQ', now: afterClose(today), api: null, store: null, game: src });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/Connect Schwab/);
  });
});
