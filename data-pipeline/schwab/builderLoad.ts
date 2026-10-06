/**
 * THE TRADE BUILDER'S DATA for one ticker, freshest first:
 *   1. Schwab, right now (read-only market data): two years of daily prices and today's option
 *      chain. During market hours the chain is today's market, so today joins the chart as a bar
 *      at the current price.
 *   2. What PULL FROM SCHWAB saved in schwab.db (prices, and the chain from each close it ran after).
 *   3. The game's own market data (game.db), for tickers it carries.
 * When no real chain exists for the newest day, one is modeled from the stock's own volatility and
 * labeled MODEL. Nothing here places orders or reads accounts.
 */

import { addDays, isTradingDay, type ISODate } from '../../src/engine/calendar';
import type { MarketBundle } from '../../src/engine/market/bundleSource';
import type { MarketDataSource } from '../../src/engine/market/source';
import type { Bar, Chain, VixBar } from '../../src/engine/market/types';
import { BUILDER_BY_SYMBOL, BUILDER_HISTORY_DAYS } from '../../src/content/builderTickers';
import { candidateInfo } from '../dolt/tickers';
import { constantMaturityIv, normalizeQuote, volSeries } from '../lib/derived';
import { historyChain, HISTORY_DEPTH } from '../lib/historyModel';
import { mapCandles, mapChain, newYorkTime } from './map';
import { tbillToRate, type SchwabMarketApi } from './pull';
import { TBILL_SYMBOL, VIX_SYMBOL, type SchwabStore } from './store';

export type BuilderSourceKind = 'schwab-live' | 'schwab-saved' | 'game';

export type BuilderLoadResult =
  | {
      ok: true;
      bundle: MarketBundle;
      source: BuilderSourceKind;
      /** Fetched from Schwab just now. */
      live: boolean;
      /** The chain is modeled (no real chain for the newest day). */
      modeledChain: boolean;
      /** Plain-language notes: why a fresher source wasn't used, what is modeled. */
      notes: string[];
      rate: number;
      vix: VixBar[];
      fetchedAt: string;
    }
  | { ok: false; message: string };

interface Found {
  bars: Bar[];
  chain: Chain | null;
  source: BuilderSourceKind;
}

function nameOf(symbol: string, game: { name: string; sector: string; isEtf: boolean } | undefined) {
  const b = BUILDER_BY_SYMBOL[symbol];
  if (b) return { name: b.name, sector: b.sector, isEtf: b.kind === 'etf' };
  const c = candidateInfo(symbol);
  if (c) return { name: c.name, sector: c.sector, isEtf: c.sector.includes('ETF') };
  return game ?? { name: symbol, sector: '—', isEtf: false };
}

/** A stored chain (bid, ask and IV only) with its greeks worked out at that day's price. */
function withGreeks(c: Chain, rate: number): Chain {
  return {
    ...c,
    quotes: c.quotes
      .map((q) => normalizeQuote(q, c.date, c.spot, rate, 0))
      .filter((q): q is NonNullable<typeof q> => !!q),
  };
}

export async function builderLoad(opts: {
  symbol: string;
  now: Date;
  api: SchwabMarketApi | null;
  store: SchwabStore | null;
  game: MarketDataSource | null;
}): Promise<BuilderLoadResult> {
  const { symbol, store, game, api } = opts;
  const notes: string[] = [];
  const today = newYorkTime(opts.now).date;
  const from = addDays(today, -BUILDER_HISTORY_DAYS);

  // Rates and the VIX, from whichever source has them.
  const bills = store?.candles(TBILL_SYMBOL, addDays(today, -120)) ?? [];
  let rate = bills.length ? tbillToRate(bills.map((b) => b.close))(bills[bills.length - 1].close) : 0.04;
  let vix: VixBar[] = (store?.candles(VIX_SYMBOL, from) ?? []).map(({ date, open, high, low, close }) => ({
    date,
    open,
    high,
    low,
    close,
  }));
  const gameSyms = game ? await game.symbols().catch(() => []) : [];
  const inGame = gameSyms.find((s) => s.symbol === symbol);
  if (game && (!vix.length || !bills.length)) {
    const meta = await game.meta().catch(() => null);
    if (meta) {
      if (!vix.length) vix = await game.vix(from, meta.lastDate).catch(() => []);
      if (!bills.length) {
        const r = await game.rates(addDays(meta.lastDate, -30), meta.lastDate).catch(() => []);
        if (r.length) rate = r[r.length - 1].r3m;
      }
    }
  }

  let found: Found | null = null;
  // 1. Schwab, live.
  if (api) {
    try {
      let bars = mapCandles(await api.priceHistory(symbol, from)).filter((b) => b.date <= today);
      const json = (await api.chain(symbol, today, addDays(today, 70))) as {
        underlyingPrice?: number;
      } | null;
      const px = Number(json?.underlyingPrice);
      const last = bars[bars.length - 1];
      // Today's session (open, or closed with no daily candle yet): today joins at the latest price.
      if (last && isTradingDay(today) && last.date < today && px > 0)
        bars = [...bars, { date: today, open: px, high: px, low: px, close: px, volume: 0, source: 'real' }];
      const end = bars[bars.length - 1];
      if (!end) throw new Error(`no price history for ${symbol}`);
      const chain = mapChain(json, symbol, end.date, px > 0 ? px : end.close, rate, 0);
      if (!chain) notes.push(`Schwab sent no usable option chain for ${symbol} today.`);
      found = { bars, chain, source: 'schwab-live' };
    } catch (e) {
      notes.push(`Couldn't reach Schwab just now (${(e as Error).message}); using saved data.`);
    }
  }
  // 2. schwab.db and 3. game.db: the newer of the two.
  if (!found) {
    const saved = store?.candles(symbol, from) ?? [];
    let gameBars: Bar[] = [];
    if (game && inGame) gameBars = await game.bars(symbol, from, inGame.lastDate).catch(() => []);
    const savedLast = saved[saved.length - 1]?.date ?? '';
    const gameLast = gameBars[gameBars.length - 1]?.date ?? '';
    if (saved.length && savedLast >= gameLast) {
      const c = store?.chains(symbol, savedLast, savedLast)[0] ?? null;
      found = { bars: saved, chain: c ? withGreeks(c, rate) : null, source: 'schwab-saved' };
    } else if (gameBars.length && game) {
      const c = await game.chain(symbol, gameLast).catch(() => null);
      found = { bars: gameBars, chain: c, source: 'game' };
    }
  }
  if (!found || !found.bars.length)
    return {
      ok: false,
      message: api
        ? `No data for ${symbol}: Schwab had none, and it isn't in your saved data.`
        : `No data for ${symbol} yet. Connect Schwab in Settings › Data (then PULL FROM SCHWAB) to load it.`,
    };

  const bars = found.bars;
  const asOf = bars[bars.length - 1].date;
  let chain = found.chain && found.chain.date === asOf ? found.chain : null;
  let modeledChain = false;
  if (!chain || !chain.quotes.length) {
    chain = historyChain({
      symbol,
      date: asOf,
      closes: bars.slice(-(HISTORY_DEPTH + 1)).map((b) => b.close),
      rate,
      divYield: 0,
      vix: vix.length ? vix[vix.length - 1].close : null,
      isEtf: nameOf(symbol, inGame).isEtf,
    });
    modeledChain = true;
    notes.push(
      `No real option chain for ${asOf}: this one is modeled from ${symbol}'s own volatility (MODEL).`,
    );
  }

  // Volatility history: the game's own when it has one, else from the real chains on hand.
  let vol =
    game && inGame && found.source === 'game' ? await game.vol(symbol, from, asOf).catch(() => []) : [];
  if (!vol.length) {
    const ivs = new Map<ISODate, number>();
    for (const c of store?.chains(symbol, from, asOf) ?? []) {
      const iv = constantMaturityIv(withGreeks(c, rate), 30, rate, 0);
      if (iv) ivs.set(c.date, iv);
    }
    if (!modeledChain) {
      const iv = constantMaturityIv(chain, 30, rate, 0);
      if (iv) ivs.set(asOf, iv);
    }
    vol = volSeries(bars, ivs);
  }
  const earnings =
    game && inGame
      ? await game.earningsSchedule(symbol, addDays(asOf, -1), addDays(asOf, 120)).catch(() => [])
      : [];

  const info = nameOf(symbol, inGame);
  return {
    ok: true,
    bundle: { symbol, ...info, bars, chain, asOf, vol, earnings },
    source: found.source,
    live: found.source === 'schwab-live',
    modeledChain,
    notes,
    rate,
    vix,
    fetchedAt: opts.now.toISOString(),
  };
}
