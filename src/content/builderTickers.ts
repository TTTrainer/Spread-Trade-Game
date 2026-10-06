/**
 * The Trade Builder's extra tickers: the next 50 most heavily traded option markets after the 25
 * the game already carries (the Mag 7, the liquid large caps, the high-IV names, SPY and DIA), in
 * two waves of 25 (v1, then v2).
 * PULL FROM SCHWAB fetches two years of daily prices for each, plus each close's option chain;
 * the Trade Builder also asks Schwab for today's chain the moment a ticker is opened.
 */

export interface BuilderTicker {
  symbol: string;
  name: string;
  sector: string;
  kind: 'etf' | 'stock';
  /** The release that added it (the Trade Builder's v2 adds another 25). */
  wave: 1 | 2;
}

export const BUILDER_TICKERS: BuilderTicker[] = [
  // Index and sector ETFs with the busiest option markets.
  { symbol: 'QQQ', name: 'Invesco QQQ (Nasdaq-100)', sector: 'Index ETF', kind: 'etf', wave: 1 },
  { symbol: 'IWM', name: 'iShares Russell 2000', sector: 'Index ETF', kind: 'etf', wave: 1 },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury', sector: 'Bond ETF', kind: 'etf', wave: 1 },
  { symbol: 'GLD', name: 'SPDR Gold Shares', sector: 'Commodity ETF', kind: 'etf', wave: 1 },
  { symbol: 'SLV', name: 'iShares Silver Trust', sector: 'Commodity ETF', kind: 'etf', wave: 1 },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR', sector: 'Sector ETF', kind: 'etf', wave: 1 },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', sector: 'Sector ETF', kind: 'etf', wave: 1 },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR', sector: 'Sector ETF', kind: 'etf', wave: 1 },
  // Single stocks with heavy daily option volume.
  { symbol: 'UNH', name: 'UnitedHealth Group', sector: 'Health Care', kind: 'stock', wave: 1 },
  { symbol: 'MSTR', name: 'Strategy (MicroStrategy)', sector: 'Technology', kind: 'stock', wave: 1 },
  { symbol: 'SOFI', name: 'SoFi Technologies', sector: 'Financials', kind: 'stock', wave: 1 },
  { symbol: 'INTC', name: 'Intel', sector: 'Semiconductors', kind: 'stock', wave: 1 },
  { symbol: 'BABA', name: 'Alibaba Group', sector: 'Consumer Discretionary', kind: 'stock', wave: 1 },
  { symbol: 'F', name: 'Ford Motor', sector: 'Autos', kind: 'stock', wave: 1 },
  { symbol: 'BAC', name: 'Bank of America', sector: 'Financials', kind: 'stock', wave: 1 },
  { symbol: 'MARA', name: 'MARA Holdings', sector: 'Financials', kind: 'stock', wave: 1 },
  { symbol: 'RIVN', name: 'Rivian Automotive', sector: 'Autos', kind: 'stock', wave: 1 },
  { symbol: 'PYPL', name: 'PayPal', sector: 'Financials', kind: 'stock', wave: 1 },
  { symbol: 'WMT', name: 'Walmart', sector: 'Consumer Staples', kind: 'stock', wave: 1 },
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy', kind: 'stock', wave: 1 },
  { symbol: 'C', name: 'Citigroup', sector: 'Financials', kind: 'stock', wave: 1 },
  { symbol: 'SNAP', name: 'Snap', sector: 'Communication', kind: 'stock', wave: 1 },
  { symbol: 'NIO', name: 'NIO', sector: 'Autos', kind: 'stock', wave: 1 },
  { symbol: 'ARM', name: 'Arm Holdings', sector: 'Semiconductors', kind: 'stock', wave: 1 },
  { symbol: 'SHOP', name: 'Shopify', sector: 'Technology', kind: 'stock', wave: 1 },
  // The second 25 (Trade Builder v2): more sector ETFs and the next busiest single names.
  { symbol: 'EEM', name: 'iShares MSCI Emerging Markets', sector: 'Index ETF', kind: 'etf', wave: 2 },
  { symbol: 'KRE', name: 'SPDR S&P Regional Banking', sector: 'Sector ETF', kind: 'etf', wave: 2 },
  { symbol: 'XBI', name: 'SPDR S&P Biotech', sector: 'Sector ETF', kind: 'etf', wave: 2 },
  { symbol: 'USO', name: 'United States Oil Fund', sector: 'Commodity ETF', kind: 'etf', wave: 2 },
  { symbol: 'FXI', name: 'iShares China Large-Cap', sector: 'Index ETF', kind: 'etf', wave: 2 },
  { symbol: 'LLY', name: 'Eli Lilly', sector: 'Health Care', kind: 'stock', wave: 2 },
  { symbol: 'V', name: 'Visa', sector: 'Financials', kind: 'stock', wave: 2 },
  { symbol: 'MA', name: 'Mastercard', sector: 'Financials', kind: 'stock', wave: 2 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Health Care', kind: 'stock', wave: 2 },
  { symbol: 'PFE', name: 'Pfizer', sector: 'Health Care', kind: 'stock', wave: 2 },
  { symbol: 'MRNA', name: 'Moderna', sector: 'Health Care', kind: 'stock', wave: 2 },
  { symbol: 'KO', name: 'Coca-Cola', sector: 'Consumer Staples', kind: 'stock', wave: 2 },
  { symbol: 'PEP', name: 'PepsiCo', sector: 'Consumer Staples', kind: 'stock', wave: 2 },
  { symbol: 'MCD', name: "McDonald's", sector: 'Consumer Discretionary', kind: 'stock', wave: 2 },
  { symbol: 'NKE', name: 'Nike', sector: 'Consumer Discretionary', kind: 'stock', wave: 2 },
  { symbol: 'SBUX', name: 'Starbucks', sector: 'Consumer Discretionary', kind: 'stock', wave: 2 },
  { symbol: 'T', name: 'AT&T', sector: 'Communication', kind: 'stock', wave: 2 },
  { symbol: 'VZ', name: 'Verizon', sector: 'Communication', kind: 'stock', wave: 2 },
  { symbol: 'CSCO', name: 'Cisco Systems', sector: 'Technology', kind: 'stock', wave: 2 },
  { symbol: 'QCOM', name: 'Qualcomm', sector: 'Semiconductors', kind: 'stock', wave: 2 },
  { symbol: 'CVX', name: 'Chevron', sector: 'Energy', kind: 'stock', wave: 2 },
  { symbol: 'DAL', name: 'Delta Air Lines', sector: 'Industrials', kind: 'stock', wave: 2 },
  { symbol: 'CCL', name: 'Carnival', sector: 'Consumer Discretionary', kind: 'stock', wave: 2 },
  { symbol: 'DKNG', name: 'DraftKings', sector: 'Consumer Discretionary', kind: 'stock', wave: 2 },
  { symbol: 'RDDT', name: 'Reddit', sector: 'Communication', kind: 'stock', wave: 2 },
];

/** How far back PULL FROM SCHWAB reaches for these tickers' daily prices. */
export const BUILDER_HISTORY_DAYS = 730;

export const BUILDER_BY_SYMBOL: Record<string, BuilderTicker> = Object.fromEntries(
  BUILDER_TICKERS.map((t) => [t.symbol, t]),
);
