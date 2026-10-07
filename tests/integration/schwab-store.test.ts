import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { nextTradingDay, prevTradingDay, type ISODate } from '../../src/engine/calendar';
import type { Bar, Chain } from '../../src/engine/market/types';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { SqliteSource } from '../../data-pipeline/lib/sqliteSource';
import { historyChain } from '../../data-pipeline/lib/historyModel';
import { buildFromSchwab } from '../../data-pipeline/schwab/build';
import { schwabPull, splitRatio, tbillToRate } from '../../data-pipeline/schwab/pull';
import { SchwabStore } from '../../data-pipeline/schwab/store';
import { afterClose, fakeSchwab } from '../helpers/fakeSchwab';

describe('schwab.db: what PULL FROM SCHWAB saves', () => {
  const src = new SyntheticSource({ lastDate: '2021-06-30', symbols: ['MKTX', 'HLXR'] });
  const dir = mkdtempSync(join(tmpdir(), 'stg-store-'));
  const storePath = join(dir, 'schwab.db');
  let today: ISODate = '2021-03-01';
  const fake = fakeSchwab(src, () => today);

  it("the first pull saves the whole history and, after the close, that close's chains", async () => {
    const r = await schwabPull({
      storePath,
      api: fake.api,
      symbols: ['SPY', 'AAPL'],
      now: afterClose(today),
    });
    expect(r.ok).toBe(true);
    expect(r.chains).toBe(2);
    expect(existsSync(storePath)).toBe(true);
    const store = new SchwabStore(storePath, { readOnly: true });
    expect(store.symbols()).toEqual(['AAPL', 'SPY']);
    expect(store.candles('SPY')[0].date <= '2018-01-05').toBe(true);
    expect(store.lastCandleDate('SPY')).toBe(today);
    expect(store.candles('$VIX').length).toBeGreaterThan(100);
    const chain = store.chains('AAPL')[0];
    expect(chain.date).toBe(today);
    expect(chain.quotes.length).toBeGreaterThan(20);
    expect(store.summary()).toMatchObject({ symbols: 2, chainDays: 1, chains: 2 });
    store.close();
  });

  it('later pulls ask only for the last two weeks, and never take a chain during market hours', async () => {
    today = '2021-03-10';
    fake.calls.length = 0;
    const r = await schwabPull({
      storePath,
      api: fake.api,
      symbols: ['SPY', 'AAPL'],
      now: new Date(`${today}T15:00:00Z`), // 10 or 11 am in New York
    });
    expect(r.chains).toBe(0);
    expect(r.closedThrough).toBe(prevTradingDay(today));
    expect(fake.calls.filter((c) => c.startsWith('chain:'))).toEqual([]);
    expect(fake.calls.find((c) => c.startsWith('history:SPY'))).toBe('history:SPY:2021-02-15');
    const store = new SchwabStore(storePath, { readOnly: true });
    expect(store.lastCandleDate('SPY')).toBe(prevTradingDay(today));
    store.close();
  });

  it('a split re-adjusts the stored history and the older chains the same way', async () => {
    today = '2021-03-12';
    const split = fakeSchwab(src, () => today, { AAPL: 4 });
    const before = new SchwabStore(storePath, { readOnly: true });
    const oldChain = before.chains('AAPL')[0];
    const oldClose = before.candles('AAPL', '2021-03-01', '2021-03-01')[0].close;
    before.close();
    await schwabPull({ storePath, api: split.api, symbols: ['AAPL'], now: afterClose(today) });
    expect(split.calls.filter((c) => c === 'history:AAPL:2018-01-01')).toHaveLength(1);
    const store = new SchwabStore(storePath, { readOnly: true });
    expect(store.splits('AAPL')).toHaveLength(1);
    expect(store.candles('AAPL', '2021-03-01', '2021-03-01')[0].close).toBeCloseTo(oldClose / 4, 6);
    const adjusted = store.chains('AAPL', oldChain.date, oldChain.date)[0];
    expect(adjusted.spot).toBeCloseTo(oldChain.spot / 4, 6);
    expect(adjusted.quotes[0].strike).toBeCloseTo(oldChain.quotes[0].strike / 4, 3);
    store.close();
  });

  it('reads split ratios and T-bill scales', () => {
    const bar = (date: ISODate, close: number): Bar => ({
      date,
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
      source: 'real',
    });
    const stored = [bar('2021-01-04', 400), bar('2021-01-05', 404), bar('2021-01-06', 410)];
    expect(splitRatio(stored, stored)).toBeNull();
    expect(
      splitRatio(
        stored,
        stored.map((b) => ({ ...b, close: b.close / 4 })),
      ),
    ).toBe(4);
    expect(tbillToRate([4.3, 4.2])(4.3)).toBeCloseTo(0.043, 6);
    expect(tbillToRate([43, 42])(43)).toBeCloseTo(0.043, 6);
  });
});

describe('BUILD GAME DATA FROM SCHWAB: a playable market from schwab.db alone', () => {
  const src = new SyntheticSource({ lastDate: '2021-06-30', symbols: ['MKTX', 'HLXR'] });
  const dir = mkdtempSync(join(tmpdir(), 'stg-sbuild-'));
  const storePath = join(dir, 'schwab.db');
  const gameDbPath = join(dir, 'game.db');
  const last: ISODate = '2021-06-29';
  let game: SqliteSource;

  beforeAll(async () => {
    const fake = fakeSchwab(src, () => last);
    // QQQ is a Trade Builder ticker: saved by the pull, never dealt by the game.
    await schwabPull({ storePath, api: fake.api, symbols: ['SPY', 'AAPL', 'QQQ'], now: afterClose(last) });
    const r = await buildFromSchwab({ storePath, gameDbPath });
    expect(r.realChains).toBe(2);
    game = new SqliteSource(gameDbPath);
  });

  it('is real data with honest notes, dealable windows and no earnings', async () => {
    const meta = await game.meta();
    expect(meta).toMatchObject({ kind: 'real', lastDate: last, benchmark: 'SPY', chainModel: 'history' });
    expect(meta.notes.join(' ')).toContain('modeled');
    expect(meta.notes.join(' ')).toContain('no earnings');
    expect((await game.symbols()).map((s) => s.symbol)).toEqual(['AAPL', 'SPY']);
    expect((await game.windows({})).length).toBeGreaterThan(50);
    expect(await game.earnings('AAPL', '2018-01-01', last)).toEqual([]);
    expect((await game.vol('AAPL', '2020-06-01', '2020-06-30'))[0]?.iv30).toBeGreaterThan(0.05);
    expect((await game.vix('2020-03-01', '2020-03-31')).length).toBeGreaterThan(10);
    expect((await game.rates(last, last))[0]?.r3m).toBeCloseTo(0.015, 6);
  });

  it("the pulled close has Schwab's real chain; every other day is modeled and labeled", async () => {
    const real = await game.chain('AAPL', last);
    expect(real?.source).toBe('real');
    const day: ISODate = '2020-06-15';
    const modeled = (await game.chain('AAPL', day)) as Chain;
    expect(modeled.source).toBe('modeled');
    expect(modeled.quotes.length).toBeGreaterThan(40);
    expect(modeled.spot).toBe((await game.bars('AAPL', day, day))[0].close);
    // A put's value falls as the strike falls; the skew makes low strikes richer in IV.
    const exp = modeled.quotes[0].expiration;
    const puts = modeled.quotes.filter((q) => q.right === 'P' && q.expiration === exp);
    expect(puts[0].iv).toBeGreaterThan(puts[puts.length - 1].iv);
    // A held contract gets a modeled quote every day.
    const q = modeled.quotes.find(
      (x) => x.right === 'P' && Math.abs(x.delta + 0.3) < 0.15,
    ) as Chain['quotes'][number];
    const to = nextTradingDay(nextTradingDay(nextTradingDay(day)));
    const hist = await game.quotes('AAPL', [q], day, to);
    expect(hist.map((h) => h.date)).toEqual(await game.tradingDays(day, to));
    expect(hist[0].bid).toBe(q.bid);
  });

  it('never looks ahead: a day prices the same with or without the later candles', async () => {
    const day: ISODate = '2020-03-16';
    const full = (await game.chain('SPY', day)) as Chain;
    const bars = await game.bars('SPY', '2018-01-01', day);
    const rates = await game.rates(day, day);
    const vix = await game.vix('2020-03-10', day);
    // The game's chain for that day is exactly the model run on the closes up to that day.
    const upToDay = historyChain({
      symbol: 'SPY',
      date: day,
      closes: bars.slice(-131).map((b) => b.close),
      rate: rates[0]?.r3m ?? 0.03,
      divYield: 0,
      vix: vix.at(-1)?.close ?? null,
      isEtf: true,
    });
    expect(full.quotes).toEqual(upToDay.quotes);
  });
});
