/**
 * The two Schwab Market Data calls, over plain fetch. Read-only: price history and option chains.
 * Runs in the data worker with an access token the main process hands it (the token is never
 * saved by the worker).
 */

import type { ISODate } from '../../src/engine/calendar';
import { SCHWAB_API } from './map';
import type { SchwabMarketApi } from './topup';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function schwabFetchApi(accessToken: string, fetchImpl: typeof fetch = fetch): SchwabMarketApi {
  let lastCall = 0;
  const get = async (path: string, params: Record<string, string>): Promise<unknown> => {
    const url = `${SCHWAB_API}/marketdata/v1/${path}?${new URLSearchParams(params).toString()}`;
    // Stay well under Schwab's 120 requests a minute.
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = lastCall + 600 - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();
      const r = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      });
      if (r.status === 429) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (r.status === 401)
        throw new Error('Schwab refused the login (401). Connect again in Settings › Data.');
      if (!r.ok) throw new Error(`Schwab ${path} answered ${r.status}`);
      return r.json();
    }
    throw new Error('Schwab is rate-limiting; try again in a minute.');
  };
  return {
    priceHistory: (symbol: string, fromDate: ISODate) =>
      get('pricehistory', {
        symbol,
        // Daily candles come by the month or the year; a first pull reaches back years.
        periodType: Date.now() - Date.parse(`${fromDate}T00:00:00Z`) > 300 * 86_400_000 ? 'year' : 'month',
        frequencyType: 'daily',
        frequency: '1',
        startDate: String(Date.parse(`${fromDate}T00:00:00Z`)),
        endDate: String(Date.now()),
        needExtendedHoursData: 'false',
      }),
    chain: (symbol: string, fromDate: ISODate, toDate: ISODate, strikeCount?: number) =>
      get('chains', {
        symbol,
        contractType: 'ALL',
        strategy: 'SINGLE',
        range: 'ALL',
        includeUnderlyingQuote: 'false',
        fromDate,
        toDate,
        ...(strikeCount ? { strikeCount: String(strikeCount) } : {}),
      }),
  };
}
