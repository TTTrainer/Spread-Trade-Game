/**
 * The Trade Builder's extra tickers: the next 25 most heavily traded option markets after the 25
 * the game already carries (the Mag 7, the liquid large caps, the high-IV names, SPY and DIA), 50
 * in all, plus the four cash-settled index options.
 * PULL FROM SCHWAB fetches two years of daily prices for each, plus each close's option chain;
 * the Trade Builder also asks Schwab for today's chain the moment a ticker is opened.
 */

export interface BuilderTicker {
  symbol: string;
  name: string;
  sector: string;
  /** 'index': a cash-settled, European-style index option (no shares, no early assignment). */
  kind: 'etf' | 'stock' | 'index';
}

export const BUILDER_TICKERS: BuilderTicker[] = [
  // Index and sector ETFs with the busiest option markets.
  { symbol: 'QQQ', name: 'Invesco QQQ (Nasdaq-100)', sector: 'Index ETF', kind: 'etf' },
  { symbol: 'IWM', name: 'iShares Russell 2000', sector: 'Index ETF', kind: 'etf' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury', sector: 'Bond ETF', kind: 'etf' },
  { symbol: 'GLD', name: 'SPDR Gold Shares', sector: 'Commodity ETF', kind: 'etf' },
  { symbol: 'SLV', name: 'iShares Silver Trust', sector: 'Commodity ETF', kind: 'etf' },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR', sector: 'Sector ETF', kind: 'etf' },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', sector: 'Sector ETF', kind: 'etf' },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR', sector: 'Sector ETF', kind: 'etf' },
  // Single stocks with heavy daily option volume.
  { symbol: 'UNH', name: 'UnitedHealth Group', sector: 'Health Care', kind: 'stock' },
  { symbol: 'MSTR', name: 'Strategy (MicroStrategy)', sector: 'Technology', kind: 'stock' },
  { symbol: 'SOFI', name: 'SoFi Technologies', sector: 'Financials', kind: 'stock' },
  { symbol: 'INTC', name: 'Intel', sector: 'Semiconductors', kind: 'stock' },
  { symbol: 'BABA', name: 'Alibaba Group', sector: 'Consumer Discretionary', kind: 'stock' },
  { symbol: 'F', name: 'Ford Motor', sector: 'Autos', kind: 'stock' },
  { symbol: 'BAC', name: 'Bank of America', sector: 'Financials', kind: 'stock' },
  { symbol: 'MARA', name: 'MARA Holdings', sector: 'Financials', kind: 'stock' },
  { symbol: 'RIVN', name: 'Rivian Automotive', sector: 'Autos', kind: 'stock' },
  { symbol: 'PYPL', name: 'PayPal', sector: 'Financials', kind: 'stock' },
  { symbol: 'WMT', name: 'Walmart', sector: 'Consumer Staples', kind: 'stock' },
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy', kind: 'stock' },
  { symbol: 'C', name: 'Citigroup', sector: 'Financials', kind: 'stock' },
  { symbol: 'SNAP', name: 'Snap', sector: 'Communication', kind: 'stock' },
  { symbol: 'NIO', name: 'NIO', sector: 'Autos', kind: 'stock' },
  { symbol: 'ARM', name: 'Arm Holdings', sector: 'Semiconductors', kind: 'stock' },
  { symbol: 'SHOP', name: 'Shopify', sector: 'Technology', kind: 'stock' },
  // Index options: cash-settled, European style. XSP is a tenth of SPX, sized for small accounts.
  { symbol: 'SPX', name: 'S&P 500 Index', sector: 'Index', kind: 'index' },
  { symbol: 'XSP', name: 'Mini-SPX Index (1/10 of SPX)', sector: 'Index', kind: 'index' },
  { symbol: 'NDX', name: 'Nasdaq-100 Index', sector: 'Index', kind: 'index' },
  { symbol: 'RUT', name: 'Russell 2000 Index', sector: 'Index', kind: 'index' },
];

/**
 * 1.8.0's second 25, no longer pulled for new since 1.8.1. Pulls had already saved them and the
 * published game.db carries them, so the Schwab build keeps them (named, and tradeable like every
 * other ticker) while schwab.db holds them: the daily data update never drops a ticker.
 */
export const FORMER_BUILDER_TICKERS: BuilderTicker[] = [
  { symbol: 'EEM', name: 'iShares MSCI Emerging Markets', sector: 'Index ETF', kind: 'etf' },
  { symbol: 'KRE', name: 'SPDR S&P Regional Banking', sector: 'Sector ETF', kind: 'etf' },
  { symbol: 'XBI', name: 'SPDR S&P Biotech', sector: 'Sector ETF', kind: 'etf' },
  { symbol: 'USO', name: 'United States Oil Fund', sector: 'Commodity ETF', kind: 'etf' },
  { symbol: 'FXI', name: 'iShares China Large-Cap', sector: 'Index ETF', kind: 'etf' },
  { symbol: 'LLY', name: 'Eli Lilly', sector: 'Health Care', kind: 'stock' },
  { symbol: 'V', name: 'Visa', sector: 'Financials', kind: 'stock' },
  { symbol: 'MA', name: 'Mastercard', sector: 'Financials', kind: 'stock' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Health Care', kind: 'stock' },
  { symbol: 'PFE', name: 'Pfizer', sector: 'Health Care', kind: 'stock' },
  { symbol: 'MRNA', name: 'Moderna', sector: 'Health Care', kind: 'stock' },
  { symbol: 'KO', name: 'Coca-Cola', sector: 'Consumer Staples', kind: 'stock' },
  { symbol: 'PEP', name: 'PepsiCo', sector: 'Consumer Staples', kind: 'stock' },
  { symbol: 'MCD', name: "McDonald's", sector: 'Consumer Discretionary', kind: 'stock' },
  { symbol: 'NKE', name: 'Nike', sector: 'Consumer Discretionary', kind: 'stock' },
  { symbol: 'SBUX', name: 'Starbucks', sector: 'Consumer Discretionary', kind: 'stock' },
  { symbol: 'T', name: 'AT&T', sector: 'Communication', kind: 'stock' },
  { symbol: 'VZ', name: 'Verizon', sector: 'Communication', kind: 'stock' },
  { symbol: 'CSCO', name: 'Cisco Systems', sector: 'Technology', kind: 'stock' },
  { symbol: 'QCOM', name: 'Qualcomm', sector: 'Semiconductors', kind: 'stock' },
  { symbol: 'CVX', name: 'Chevron', sector: 'Energy', kind: 'stock' },
  { symbol: 'DAL', name: 'Delta Air Lines', sector: 'Industrials', kind: 'stock' },
  { symbol: 'CCL', name: 'Carnival', sector: 'Consumer Discretionary', kind: 'stock' },
  { symbol: 'DKNG', name: 'DraftKings', sector: 'Consumer Discretionary', kind: 'stock' },
  { symbol: 'RDDT', name: 'Reddit', sector: 'Communication', kind: 'stock' },
];

export const FORMER_BUILDER_BY_SYMBOL: Record<string, BuilderTicker> = Object.fromEntries(
  FORMER_BUILDER_TICKERS.map((t) => [t.symbol, t]),
);

/** How far back PULL FROM SCHWAB reaches for these tickers' daily prices. */
export const BUILDER_HISTORY_DAYS = 730;

export const BUILDER_BY_SYMBOL: Record<string, BuilderTicker> = Object.fromEntries(
  BUILDER_TICKERS.map((t) => [t.symbol, t]),
);

export const isCashIndex = (symbol: string): boolean => BUILDER_BY_SYMBOL[symbol]?.kind === 'index';

/** How Schwab spells a ticker: indexes take a leading $ ($SPX), everything else is as written. */
export const schwabSymbol = (symbol: string): string => (isCashIndex(symbol) ? `$${symbol}` : symbol);
