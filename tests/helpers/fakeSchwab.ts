/**
 * A fake Schwab market-data API over the SIM market, for tests: SPY and AAPL are two SIM
 * tickers' prices under real names, $VIX is the SIM VIX and $IRX a flat 1.5% T-bill.
 */
import type { ISODate } from '../../src/engine/calendar';
import type { Chain } from '../../src/engine/market/types';
import type { SyntheticSource } from '../../src/engine/market/synthetic/source';
import type { SchwabMarketApi } from '../../data-pipeline/schwab/pull';

/** New York midnight of a day, the way Schwab stamps daily candles. */
export const nyMidnight = (d: ISODate) => Date.parse(`${d}T05:00:00Z`);
export const afterClose = (d: ISODate) => new Date(`${d}T22:00:00Z`);

export function schwabChainJson(c: Chain) {
  const maps: Record<'callExpDateMap' | 'putExpDateMap', Record<string, Record<string, unknown[]>>> = {
    callExpDateMap: {},
    putExpDateMap: {},
  };
  for (const q of c.quotes) {
    const m = q.right === 'C' ? maps.callExpDateMap : maps.putExpDateMap;
    (m[`${q.expiration}:0`] ??= {})[q.strike.toFixed(1)] = [
      {
        putCall: q.right === 'C' ? 'CALL' : 'PUT',
        bid: q.bid,
        ask: q.ask,
        volatility: q.iv * 100,
        strikePrice: q.strike,
        expirationDate: `${q.expiration}T20:00:00.000+00:00`,
      },
    ];
  }
  return maps;
}

export function fakeSchwab(src: SyntheticSource, today: () => ISODate, scale: Record<string, number> = {}) {
  const names: Record<string, string> = { SPY: 'MKTX', AAPL: 'HLXR' };
  const calls: string[] = [];
  const api: SchwabMarketApi = {
    priceHistory: async (symbol, fromDate) => {
      calls.push(`history:${symbol}:${fromDate}`);
      let bars: { date: ISODate; open: number; high: number; low: number; close: number; volume?: number }[];
      if (symbol === '$VIX') bars = await src.vix(fromDate, today());
      else if (symbol === '$IRX')
        bars = (await src.tradingDays(fromDate, today())).map((date) => ({
          date,
          open: 1.5,
          high: 1.5,
          low: 1.5,
          close: 1.5,
        }));
      else bars = await src.bars(names[symbol], fromDate, today());
      const k = scale[symbol] ?? 1;
      return {
        candles: bars.map((b) => ({
          open: b.open / k,
          high: b.high / k,
          low: b.low / k,
          close: b.close / k,
          volume: b.volume ?? 0,
          datetime: nyMidnight(b.date),
        })),
      };
    },
    chain: async (symbol, fromDate) => {
      calls.push(`chain:${symbol}`);
      const c = (await src.chain(names[symbol], fromDate)) as Chain;
      const k = scale[symbol] ?? 1;
      return schwabChainJson({
        ...c,
        quotes: c.quotes.map((q) => ({ ...q, strike: q.strike / k, bid: q.bid / k, ask: q.ask / k })),
      });
    },
  };
  return { api, calls };
}
