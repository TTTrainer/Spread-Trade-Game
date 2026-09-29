/** Candidate tickers and the selection rule from the build plan (section 13, step 4). */

export interface Candidate {
  symbol: string;
  group: 'mag7' | 'liquid' | 'highiv' | 'context';
  name: string;
  sector: string;
}

export const CANDIDATES: Candidate[] = [
  { symbol: 'AAPL', group: 'mag7', name: 'Apple', sector: 'Technology' },
  { symbol: 'MSFT', group: 'mag7', name: 'Microsoft', sector: 'Technology' },
  { symbol: 'NVDA', group: 'mag7', name: 'NVIDIA', sector: 'Semiconductors' },
  { symbol: 'AMZN', group: 'mag7', name: 'Amazon', sector: 'Consumer Discretionary' },
  { symbol: 'GOOGL', group: 'mag7', name: 'Alphabet', sector: 'Communication' },
  { symbol: 'META', group: 'mag7', name: 'Meta Platforms', sector: 'Communication' },
  { symbol: 'TSLA', group: 'mag7', name: 'Tesla', sector: 'Autos' },
  { symbol: 'AMD', group: 'liquid', name: 'Advanced Micro Devices', sector: 'Semiconductors' },
  { symbol: 'NFLX', group: 'liquid', name: 'Netflix', sector: 'Communication' },
  { symbol: 'AVGO', group: 'liquid', name: 'Broadcom', sector: 'Semiconductors' },
  { symbol: 'JPM', group: 'liquid', name: 'JPMorgan Chase', sector: 'Financials' },
  { symbol: 'BA', group: 'liquid', name: 'Boeing', sector: 'Industrials' },
  { symbol: 'UBER', group: 'liquid', name: 'Uber', sector: 'Industrials' },
  { symbol: 'COST', group: 'liquid', name: 'Costco', sector: 'Consumer Staples' },
  { symbol: 'ORCL', group: 'liquid', name: 'Oracle', sector: 'Technology' },
  { symbol: 'CRM', group: 'liquid', name: 'Salesforce', sector: 'Technology' },
  { symbol: 'DIS', group: 'liquid', name: 'Walt Disney', sector: 'Communication' },
  { symbol: 'PLTR', group: 'highiv', name: 'Palantir', sector: 'Technology' },
  { symbol: 'SMCI', group: 'highiv', name: 'Super Micro Computer', sector: 'Technology' },
  { symbol: 'COIN', group: 'highiv', name: 'Coinbase', sector: 'Financials' },
  { symbol: 'MU', group: 'highiv', name: 'Micron', sector: 'Semiconductors' },
  { symbol: 'GME', group: 'highiv', name: 'GameStop', sector: 'Retail' },
  { symbol: 'HOOD', group: 'highiv', name: 'Robinhood', sector: 'Financials' },
  { symbol: 'SPY', group: 'context', name: 'SPDR S&P 500 ETF', sector: 'Index ETF' },
  { symbol: 'DIA', group: 'context', name: 'SPDR Dow Jones ETF', sector: 'Index ETF' },
];

export interface CandidateScore {
  symbol: string;
  present: boolean;
  chainFirst: string | null;
  chainLast: string | null;
  chainDays: number;
  barFirst: string | null;
  liquidity: number | null; // median relative spread, lower is better
  ivLevel: number | null; // median ATM IV
}

export interface Selection {
  symbol: string;
  reason: string;
}

/**
 * All Mag 7 names, the 6-8 most liquid of the "liquid" group, the 4-5 highest-IV names whose
 * markets are still tradable, plus SPY and DIA for context and the benchmark.
 */
export function selectTickers(scores: CandidateScore[], maxHighIvSpread = 0.2): Selection[] {
  const by = new Map(scores.map((s) => [s.symbol, s] as const));
  const ok = (sym: string) => {
    const s = by.get(sym);
    return !!s && s.present && s.chainDays > 200;
  };
  const out: Selection[] = [];
  for (const c of CANDIDATES.filter((c) => c.group === 'mag7' && ok(c.symbol)))
    out.push({ symbol: c.symbol, reason: 'Mag 7: kept by rule' });
  const liquid = CANDIDATES.filter((c) => c.group === 'liquid' && ok(c.symbol))
    .map((c) => by.get(c.symbol) as CandidateScore)
    .filter((s) => s.liquidity !== null)
    .sort((a, b) => (a.liquidity as number) - (b.liquidity as number))
    .slice(0, 8);
  for (const s of liquid)
    out.push({
      symbol: s.symbol,
      reason: `Liquid: median spread ${(100 * (s.liquidity as number)).toFixed(1)}% of mid`,
    });
  const highiv = CANDIDATES.filter((c) => c.group === 'highiv' && ok(c.symbol))
    .map((c) => by.get(c.symbol) as CandidateScore)
    .filter((s) => s.ivLevel !== null && s.liquidity !== null && (s.liquidity as number) <= maxHighIvSpread)
    .sort((a, b) => (b.ivLevel as number) - (a.ivLevel as number))
    .slice(0, 5);
  for (const s of highiv)
    out.push({
      symbol: s.symbol,
      reason: `High IV: median ATM IV ${(100 * (s.ivLevel as number)).toFixed(0)}%, spread ${(100 * (s.liquidity as number)).toFixed(1)}%`,
    });
  for (const c of CANDIDATES.filter((c) => c.group === 'context' && ok(c.symbol)))
    out.push({ symbol: c.symbol, reason: 'Market context and benchmark' });
  return out;
}

export function candidateInfo(symbol: string): Candidate | undefined {
  return CANDIDATES.find((c) => c.symbol === symbol);
}
