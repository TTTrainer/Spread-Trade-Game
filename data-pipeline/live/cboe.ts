/**
 * Cboe's free delayed quotes: the Trade Builder's "right now" for anyone without Schwab. One call
 * per ticker returns the underlying's quote (today's open, high, low and last price) and every
 * listed option with its bid, ask and IV, all about 15 minutes behind the market. Cboe's own
 * website runs on it; it needs no key. Read-only: nothing is ever sent anywhere.
 *
 * Pure mapping plus one fetch, so the mapping is tested without a network.
 */

import { diffDays, isTradingDay, type ISODate } from '../../src/engine/calendar';
import type { Bar, Chain, OptionQuote } from '../../src/engine/market/types';
import { isCashIndex } from '../../src/content/builderTickers';
import { normalizeQuote } from '../lib/derived';

/** How far behind the market Cboe's free quotes run. */
export const CBOE_DELAY_MINUTES = 15;

export function cboeBaseUrl(): string {
  return (process.env.STG_CBOE_URL ?? 'https://cdn.cboe.com/api/global/delayed_quotes').replace(/\/+$/, '');
}

/** Cboe spells indexes with a leading underscore: _SPX. */
export const cboeSymbol = (symbol: string): string => (isCashIndex(symbol) ? `_${symbol}` : symbol);

export interface CboeApi {
  options(symbol: string): Promise<unknown>;
  /** Daily candles, for a ticker with no saved history or a gap since it. */
  history(symbol: string): Promise<unknown>;
}

export function cboeFetchApi(
  fetchImpl: (url: string, init?: { signal?: AbortSignal }) => Promise<Response> = fetch,
  baseUrl = cboeBaseUrl(),
): CboeApi {
  const get = async (url: string, symbol: string) => {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
    if (r.status === 403 || r.status === 404) throw new Error(`Cboe has no delayed quotes for ${symbol}`);
    if (!r.ok) throw new Error(`Cboe answered ${r.status}`);
    return r.json();
  };
  const sym = (symbol: string) => encodeURIComponent(cboeSymbol(symbol));
  return {
    options: (symbol) => get(`${baseUrl}/options/${sym(symbol)}.json`, symbol),
    history: (symbol) => get(`${baseUrl}/charts/historical/${sym(symbol)}.json`, symbol),
  };
}

interface CboeOption {
  option: string;
  bid: number;
  ask: number;
  iv: number;
}

interface CboeJson {
  timestamp?: string;
  data?: {
    current_price?: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
    /** New York local time of the last trade, e.g. "2026-11-02T14:13:26". */
    last_trade_time?: string | null;
    options?: CboeOption[];
  };
}

/** An OCC option symbol: root, YYMMDD, C or P, strike x 1000 in 8 digits (SPXW261106P06500000). */
export function parseOcc(
  s: string,
): { root: string; expiration: ISODate; right: 'C' | 'P'; strike: number } | null {
  const m = /^([A-Z0-9]+?)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(s);
  if (!m) return null;
  return {
    root: m[1],
    expiration: `20${m[2]}-${m[3]}-${m[4]}` as ISODate,
    right: m[5] as 'C' | 'P',
    strike: Number(m[6]) / 1000,
  };
}

/**
 * The option roots that are the standard contract for a ticker. Others in the feed are adjusted
 * contracts after a split or merger (AAPL1) or other products: they don't deliver 100 shares.
 * Index weeklies settle at the close (SPXW, NDXP, RUTW) beside the AM-settled monthlies.
 */
function rootRank(symbol: string, root: string): number | null {
  if (root === symbol) return 1;
  if (isCashIndex(symbol) && (root === `${symbol}W` || root === `${symbol}P`)) return 2;
  return null;
}

export interface CboeSnapshot {
  /** The session the quotes are from (New York date of the last trade). */
  asOf: ISODate;
  /** That session's candle so far: today's open, high, low and the latest (delayed) price. */
  bar: Bar;
  chain: Chain | null;
  /** New York time of the last trade, "14:13". */
  quoteTime: string | null;
}

/**
 * One delayed snapshot in the game's shape: the underlying's candle for the session so far, and
 * a chain with expirations up to 70 days and strikes within 30% of the price, one contract per
 * strike (an index's PM-settled weekly over its AM monthly, then the tighter market), greeks
 * worked out from each quote the same way as every other chain in the game.
 */
export function mapCboe(json: unknown, symbol: string, rate: number, today: ISODate): CboeSnapshot | null {
  const d = (json as CboeJson | null)?.data;
  const px = Number(d?.current_price ?? d?.close);
  if (!d || !(px > 0)) return null;
  const traded = typeof d.last_trade_time === 'string' ? d.last_trade_time : null;
  const asOf = (traded && /^\d{4}-\d{2}-\d{2}/.test(traded) ? traded.slice(0, 10) : today) as ISODate;
  if (!isTradingDay(asOf)) return null;
  const open = Number(d.open) > 0 ? Number(d.open) : px;
  const bar: Bar = {
    date: asOf,
    open,
    high: Math.max(Number(d.high) || 0, open, px),
    low: Math.min(Number(d.low) > 0 ? Number(d.low) : px, open, px),
    close: px,
    volume: Math.max(0, Math.round(Number(d.volume) || 0)),
    source: 'real',
  };

  const picked = new Map<string, { rank: number; q: OptionQuote }>();
  for (const o of d.options ?? []) {
    const p = parseOcc(o.option);
    if (!p) continue;
    const rank = rootRank(symbol, p.root);
    if (rank === null) continue;
    const dte = diffDays(asOf, p.expiration);
    if (dte < 0 || dte > 70 || Math.abs(p.strike / px - 1) > 0.3) continue;
    const base: OptionQuote = {
      expiration: p.expiration,
      strike: p.strike,
      right: p.right,
      bid: Math.max(0, Number(o.bid) || 0),
      ask: Math.max(0, Number(o.ask) || 0),
      iv: o.iv > 0 && o.iv < 5 ? o.iv : 0,
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
      source: 'real',
    };
    if (base.ask <= 0) continue;
    const q = normalizeQuote(base, asOf, px, rate, 0);
    if (!q) continue;
    const key = `${q.expiration}|${q.strike}|${q.right}`;
    const had = picked.get(key);
    if (!had || rank > had.rank || (rank === had.rank && q.ask - q.bid < had.q.ask - had.q.bid))
      picked.set(key, { rank, q });
  }
  const quotes = [...picked.values()].map((x) => x.q);
  quotes.sort((a, b) =>
    a.expiration !== b.expiration
      ? a.expiration < b.expiration
        ? -1
        : 1
      : a.strike - b.strike || (a.right < b.right ? -1 : 1),
  );
  return {
    asOf,
    bar,
    chain: quotes.length ? { symbol, date: asOf, spot: px, source: 'real', quotes } : null,
    quoteTime: traded && traded.length >= 16 ? traded.slice(11, 16) : null,
  };
}

/** Cboe's daily candles (numbers arrive as text; early index rows have no open). */
export function mapCboeHistory(json: unknown): Bar[] {
  const rows = (json as { data?: Record<string, unknown>[] } | null)?.data ?? [];
  const out: Bar[] = [];
  for (const r of rows) {
    const date = String(r.date ?? '') as ISODate;
    const close = Number(r.close);
    const high = Number(r.high);
    const low = Number(r.low);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isTradingDay(date) || !(close > 0 && low > 0 && high >= low))
      continue;
    const open = Number(r.open) > 0 ? Number(r.open) : close;
    out.push({
      date,
      open,
      high,
      low,
      close,
      volume: Math.max(0, Math.round(Number(r.volume) || 0)),
      source: 'real',
    });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out.filter((b, i) => i === 0 || b.date !== out[i - 1].date);
}
