/**
 * The DoltHub schemas are community-maintained and can change. Instead of hard-coding them,
 * the pipeline looks up each table's real column names and maps them to what it needs,
 * failing with a plain message if something essential is missing.
 */
import type { DoltServer } from './server';

export interface TableMap {
  db: string;
  table: string;
  cols: Record<string, string>;
}

export interface Wanted {
  db: string;
  tables: string[];
  cols: Record<string, string[]>; // logical name -> candidate column names (first match wins)
  optional?: string[];
}

export const WANTED: Record<string, Wanted> = {
  chain: {
    db: 'options',
    tables: ['option_chain', 'option_chains', 'chain'],
    cols: {
      date: ['date', 'quote_date'],
      symbol: ['act_symbol', 'symbol', 'underlying'],
      expiration: ['expiration', 'expiration_date', 'expiry'],
      strike: ['strike', 'strike_price'],
      right: ['call_put', 'type', 'cp', 'option_type'],
      bid: ['bid'],
      ask: ['ask'],
      iv: ['vol', 'iv', 'implied_volatility'],
      delta: ['delta'],
      gamma: ['gamma'],
      theta: ['theta'],
      vega: ['vega'],
      rho: ['rho'],
    },
    optional: ['iv', 'delta', 'gamma', 'theta', 'vega', 'rho'],
  },
  ohlcv: {
    db: 'stocks',
    tables: ['ohlcv', 'daily_prices', 'prices'],
    cols: {
      date: ['date'],
      symbol: ['act_symbol', 'symbol'],
      open: ['open'],
      high: ['high'],
      low: ['low'],
      close: ['close'],
      volume: ['volume'],
    },
  },
  symbol: {
    db: 'stocks',
    tables: ['symbol', 'symbols'],
    cols: { symbol: ['act_symbol', 'symbol'], name: ['security_name', 'name'], isEtf: ['is_etf'] },
    optional: ['name', 'isEtf'],
  },
  dividend: {
    db: 'stocks',
    tables: ['dividend', 'dividends'],
    cols: { symbol: ['act_symbol', 'symbol'], exDate: ['ex_date', 'date'], amount: ['amount', 'dividend'] },
  },
  split: {
    db: 'stocks',
    tables: ['split', 'splits'],
    cols: {
      symbol: ['act_symbol', 'symbol'],
      exDate: ['ex_date', 'date'],
      to: ['to_factor', 'numerator'],
      for: ['for_factor', 'denominator'],
    },
  },
  earningsCalendar: {
    db: 'earnings',
    tables: ['earnings_calendar', 'calendar'],
    cols: { symbol: ['act_symbol', 'symbol'], date: ['date'], when: ['when', 'time', 'timing'] },
    optional: ['when'],
  },
  epsHistory: {
    db: 'earnings',
    tables: ['eps_history'],
    cols: {
      symbol: ['act_symbol', 'symbol'],
      periodEnd: ['period_end_date', 'period_end', 'date'],
      reported: ['reported', 'actual', 'eps'],
      estimate: ['estimate', 'consensus'],
    },
    optional: ['estimate'],
  },
  income: {
    db: 'earnings',
    tables: ['income_statement'],
    cols: {
      symbol: ['act_symbol', 'symbol'],
      date: ['date', 'period_end_date'],
      period: ['period'],
      revenue: ['sales', 'revenue', 'total_revenue'],
      netIncome: ['net_income'],
      shares: ['average_shares', 'diluted_shares', 'shares_outstanding'],
    },
    optional: ['period', 'revenue', 'netIncome', 'shares'],
  },
  treasury: {
    db: 'rates',
    tables: ['us_treasury', 'treasury'],
    cols: {
      date: ['date'],
      m3: ['3_month', 'month_3'],
      y1: ['1_year', 'year_1'],
      y2: ['2_year', 'year_2'],
      y10: ['10_year', 'year_10'],
    },
  },
};

export async function introspect(server: DoltServer, want: Wanted): Promise<TableMap> {
  const tables = (await server.query<Record<string, string>>(`SHOW TABLES FROM \`${want.db}\``)).map(
    (r) => Object.values(r)[0],
  );
  const table = want.tables.find((t) => tables.includes(t));
  if (!table)
    throw new Error(
      `Dolt database "${want.db}" has none of the tables ${want.tables.join(', ')} (found: ${tables.join(', ')})`,
    );
  const colsRaw = await server.query<{ Field: string }>(`SHOW COLUMNS FROM \`${want.db}\`.\`${table}\``);
  const have = colsRaw.map((c) => c.Field);
  const cols: Record<string, string> = {};
  for (const [logical, candidates] of Object.entries(want.cols)) {
    const hit = candidates.find((c) => have.includes(c));
    if (hit) cols[logical] = hit;
    else if (!want.optional?.includes(logical)) {
      throw new Error(
        `Table ${want.db}.${table} is missing a "${logical}" column (looked for ${candidates.join(', ')}; found ${have.join(', ')})`,
      );
    }
  }
  return { db: want.db, table, cols };
}

export const q = (m: TableMap, logical: string): string =>
  m.cols[logical] ? `\`${m.cols[logical]}\`` : 'NULL';
export const from = (m: TableMap): string => `\`${m.db}\`.\`${m.table}\``;
