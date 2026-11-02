/**
 * Schwab Market Data (read-only) to game.db rows. Only the market-data endpoints are used:
 * price history and option chains. Nothing here touches accounts or orders.
 *
 * Pure functions, so the mapping is tested without a network: the login URL, the code in the
 * pasted redirect address, which day's close is final, and the JSON shapes of candles and chains.
 */

import { diffDays, isTradingDay, prevTradingDay, type ISODate } from '../../src/engine/calendar';
import type { Bar, Chain, OptionQuote } from '../../src/engine/market/types';
import { normalizeQuote } from '../lib/derived';

export const SCHWAB_API = 'https://api.schwabapi.com';
export const SCHWAB_TOKEN_URL = `${SCHWAB_API}/v1/oauth/token`;
export const DEFAULT_CALLBACK = 'https://127.0.0.1';

export function schwabAuthUrl(appKey: string, callbackUrl: string): string {
  const q = new URLSearchParams({ client_id: appKey, redirect_uri: callbackUrl, response_type: 'code' });
  return `${SCHWAB_API}/v1/oauth/authorize?${q.toString()}`;
}

/**
 * The login ends on the callback address with `?code=...` in it (the page itself may not load).
 * Accepts that whole address, or just the code.
 */
export function codeFromRedirect(pasted: string): string | null {
  const text = pasted.trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) {
    try {
      return new URL(text).searchParams.get('code');
    } catch {
      return null;
    }
  }
  // A bare code: it may still be URL-encoded (Schwab codes end in "%40", an encoded "@").
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** The New York calendar date and minutes after midnight for an instant. */
export function newYorkTime(now: Date): { date: ISODate; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}` as ISODate,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

const OPEN_MIN = 9 * 60 + 30;
/** A little after 4:00 pm so the closing prints have settled. */
const CLOSED_MIN = 16 * 60 + 15;

/**
 * The latest trading day whose close is final, and whether a chain fetched right now shows that
 * close. During market hours today's candle is still forming, so it is left out, and a chain
 * fetched then would show today's prices, not yesterday's close, so none is taken.
 */
export function closedThrough(now: Date): { date: ISODate; chainIsClose: boolean } {
  const { date, minutes } = newYorkTime(now);
  if (!isTradingDay(date)) return { date: prevTradingDay(date), chainIsClose: true };
  if (minutes >= CLOSED_MIN) return { date, chainIsClose: true };
  if (minutes < OPEN_MIN) return { date: prevTradingDay(date), chainIsClose: true };
  return { date: prevTradingDay(date), chainIsClose: false };
}

interface SchwabCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  datetime: number;
}

/** Daily candles from /marketdata/v1/pricehistory. Each candle's time is that day in New York. */
export function mapCandles(json: unknown): Bar[] {
  const candles = (json as { candles?: SchwabCandle[] } | null)?.candles ?? [];
  const out: Bar[] = [];
  for (const c of candles) {
    if (!(c.close > 0 && c.low > 0 && c.high >= c.low)) continue;
    const date = newYorkTime(new Date(c.datetime)).date;
    if (!isTradingDay(date)) continue;
    out.push({
      date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: Math.max(0, Math.round(c.volume ?? 0)),
      source: 'real',
    });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out.filter((b, i) => i === 0 || b.date !== out[i - 1].date);
}

interface SchwabContract {
  putCall: 'PUT' | 'CALL';
  bid: number;
  ask: number;
  volatility: number;
  strikePrice: number;
  expirationDate: string;
  /** Adjusted (after a split or merger) and mini contracts don't deliver the standard 100 shares. */
  nonStandard?: boolean;
  mini?: boolean;
  multiplier?: number;
  /** 'A' (AM, the opening print) or 'P' (PM, the close): SPX lists both on monthly Fridays. */
  settlementType?: string;
}

type ExpMap = Record<string, Record<string, SchwabContract[]>>;

/**
 * One day's chain from /marketdata/v1/chains, in the game's shape: expirations up to 70 days,
 * strikes within 30% of spot, greeks recomputed from each quote's IV the way the pipeline does
 * for DoltHub rows (Schwab's volatility is in percent; -999 means none). Only standard
 * 100-multiplier contracts, one per strike: where two share a strike and day (SPX's AM-settled
 * monthly beside its PM-settled weekly), the PM one, then the tighter market.
 */
export function mapChain(
  json: unknown,
  symbol: string,
  date: ISODate,
  spot: number,
  rate: number,
  divYield: number,
): Chain | null {
  const j = json as { callExpDateMap?: ExpMap; putExpDateMap?: ExpMap } | null;
  const picked = new Map<string, { c: SchwabContract; q: OptionQuote }>();
  const better = (a: SchwabContract, qa: OptionQuote, b: SchwabContract, qb: OptionQuote) =>
    (a.settlementType === 'P') !== (b.settlementType === 'P')
      ? a.settlementType === 'P'
      : qa.ask - qa.bid < qb.ask - qb.bid;
  for (const map of [j?.callExpDateMap, j?.putExpDateMap]) {
    for (const [expKey, strikes] of Object.entries(map ?? {})) {
      const expiration = expKey.slice(0, 10) as ISODate;
      const dte = diffDays(date, expiration);
      if (dte < 0 || dte > 70) continue;
      for (const list of Object.values(strikes)) {
        for (const c of list) {
          if (c.nonStandard || c.mini || (c.multiplier !== undefined && Number(c.multiplier) !== 100))
            continue;
          const strike = Number(c.strikePrice);
          if (!(strike > 0) || Math.abs(strike / spot - 1) > 0.3) continue;
          const base: OptionQuote = {
            expiration,
            strike,
            right: c.putCall === 'PUT' ? 'P' : 'C',
            bid: Math.max(0, Number(c.bid) || 0),
            ask: Math.max(0, Number(c.ask) || 0),
            iv: c.volatility > 0 && c.volatility < 500 ? c.volatility / 100 : 0,
            delta: 0,
            gamma: 0,
            theta: 0,
            vega: 0,
            rho: 0,
            source: 'real',
          };
          if (base.ask <= 0) continue;
          const q = normalizeQuote(base, date, spot, rate, divYield);
          if (!q) continue;
          const key = `${q.expiration}|${q.strike}|${q.right}`;
          const had = picked.get(key);
          if (!had || better(c, q, had.c, had.q)) picked.set(key, { c, q });
        }
      }
    }
  }
  const quotes = [...picked.values()].map((p) => p.q);
  if (!quotes.length) return null;
  quotes.sort((a, b) =>
    a.expiration !== b.expiration
      ? a.expiration < b.expiration
        ? -1
        : 1
      : a.strike - b.strike || (a.right < b.right ? -1 : 1),
  );
  return { symbol, date, spot, source: 'real', quotes };
}
