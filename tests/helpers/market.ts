import { buildChain } from '../../src/engine/pricing/chainModel';
import type { DayBook } from '../../src/engine/lifecycle/types';
import type { Chain, ContractKey, OptionQuote } from '../../src/engine/market/types';

export interface FlatMarketOpts {
  date: string;
  spot: number;
  vol?: number;
  expirations: string[];
  strikes?: number[];
  halfSpread?: number;
  rate?: number;
}

/** A hand-built chain with a flat volatility surface and a fixed half spread. */
export function flatChain(o: FlatMarketOpts): Chain {
  const strikes = o.strikes ?? Array.from({ length: 41 }, (_, i) => 80 + i);
  return buildChain({
    symbol: 'TEST',
    date: o.date,
    spot: o.spot,
    rate: o.rate ?? 0.03,
    divYield: 0,
    expirations: o.expirations,
    strikes: () => strikes,
    model: { iv: () => o.vol ?? 0.3, halfSpread: () => o.halfSpread ?? 0.05 },
    source: 'synthetic',
    minAbsDelta: 0,
  });
}

export function bookFromChain(chain: Chain, extra: Partial<DayBook> = {}): DayBook {
  const idx = new Map(chain.quotes.map((q) => [`${q.expiration}|${q.strike}|${q.right}`, q] as const));
  return {
    date: chain.date,
    spot: chain.spot,
    open: chain.spot,
    rate: 0.03,
    divYield: 0,
    quote: (k: ContractKey): OptionQuote | null => idx.get(`${k.expiration}|${k.strike}|${k.right}`) ?? null,
    earningsTomorrow: false,
    exDivToday: null,
    exDivTomorrow: null,
    gapDay: false,
    atr: 2,
    ...extra,
  };
}

export function flatBook(o: FlatMarketOpts, extra: Partial<DayBook> = {}): DayBook {
  return bookFromChain(flatChain(o), extra);
}
