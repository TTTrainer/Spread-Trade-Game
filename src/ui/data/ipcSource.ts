import type { ISODate } from '../../engine/calendar';
import type { ClockAwareSource, MarketDataSource } from '../../engine/market/source';
import { bridge } from '../bridge';

type Method = keyof MarketDataSource;

/**
 * The renderer's view of market data: every call goes over IPC to the main process together
 * with the caller's simulated date, and the main process refuses anything dated later.
 */
export function ipcSource(clock: (() => ISODate) | null = null): ClockAwareSource {
  const call =
    (method: Method) =>
    (...args: unknown[]) =>
      bridge().invoke('market.call', method, args, clock ? clock() : null);
  const methods: Method[] = [
    'meta',
    'symbols',
    'tradingDays',
    'bars',
    'chain',
    'quotes',
    'earnings',
    'earningsSchedule',
    'dividends',
    'splits',
    'vol',
    'fundamentals',
    'rates',
    'vix',
    'macro',
    'windows',
    'window',
  ];
  const src = Object.fromEntries(methods.map((m) => [m, call(m)])) as unknown as MarketDataSource;
  return { ...src, withClock: (c: () => ISODate) => ipcSource(c) };
}
