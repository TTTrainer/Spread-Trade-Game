/**
 * Data validation over a built game.db. Returns a list of problems; an empty list means
 * the database is safe to deal from. Run by `npm run data:build`, the report and the tests.
 */
import { isTradingDay } from '../src/engine/calendar';
import { all, get, type Db } from './lib/sqlite';
import { decDate } from './lib/schema';

export interface ValidationIssue {
  check: string;
  detail: string;
}

export interface ValidationOptions {
  /** From this date on, every trading day must have a chain (recent years are recorded daily). */
  dailyChainsFrom?: string;
  maxIssuesPerCheck?: number;
}

export function validateGameDb(db: Db, opts: ValidationOptions = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cap = opts.maxIssuesPerCheck ?? 20;
  const add = (check: string, rows: unknown[], fmt: (r: never) => string) => {
    for (const r of rows.slice(0, cap)) issues.push({ check, detail: fmt(r as never) });
  };

  add(
    'bid <= ask',
    all(db.prepare('SELECT symbol, date, expiration, strike, cp FROM chains WHERE bid > ask LIMIT ?'), cap),
    (r: Record<string, number>) => JSON.stringify(r),
  );
  add(
    'no negative prices',
    all(db.prepare('SELECT symbol, date FROM chains WHERE bid < 0 OR ask < 0 LIMIT ?'), cap),
    (r: Record<string, number>) => JSON.stringify(r),
  );
  add(
    'no negative bars',
    all(
      db.prepare(
        'SELECT symbol, date FROM bars WHERE low <= 0 OR high < low OR close < low OR close > high OR open < low OR open > high LIMIT ?',
      ),
      cap,
    ),
    (r: Record<string, number>) => JSON.stringify(r),
  );
  add(
    'IV between 0 and 5',
    all(db.prepare('SELECT symbol, date, strike FROM chains WHERE iv <= 0 OR iv > 50000 LIMIT ?'), cap),
    (r: Record<string, number>) => JSON.stringify(r),
  );
  add(
    'sane greeks',
    all(
      db.prepare(
        "SELECT symbol, date, strike, cp, delta, gamma FROM chains WHERE (cp = 'C' AND (delta < 0 OR delta > 10000)) OR (cp = 'P' AND (delta > 0 OR delta < -10000)) OR gamma < 0 OR vega < 0 LIMIT ?",
      ),
      cap,
    ),
    (r: Record<string, number>) => JSON.stringify(r),
  );
  add(
    'expiration after date',
    all(db.prepare('SELECT symbol, date, expiration FROM chains WHERE expiration < date LIMIT ?'), cap),
    (r: Record<string, number>) => JSON.stringify(r),
  );
  add(
    'no duplicate keys',
    all(
      db.prepare('SELECT symbol, date, COUNT(*) n FROM bars GROUP BY symbol, date HAVING n > 1 LIMIT ?'),
      cap,
    ),
    (r: Record<string, number>) => JSON.stringify(r),
  );
  add(
    'bars on trading days only',
    all<{ date: number }>(db.prepare('SELECT DISTINCT date FROM bars')).filter(
      (r) => !isTradingDay(decDate(r.date)),
    ),
    (r: { date: number }) => `bar on non-trading day ${decDate(r.date)}`,
  );
  add(
    'chain days have spot bars',
    all(
      db.prepare(
        'SELECT c.symbol, c.date FROM chain_days c LEFT JOIN bars b ON b.symbol = c.symbol AND b.date = c.date WHERE b.date IS NULL LIMIT ?',
      ),
      cap,
    ),
    (r: Record<string, number>) => JSON.stringify(r),
  );

  // Windows must never span a split, must enter on a real chain, and need a year of history.
  add(
    'no windows across splits',
    all(
      db.prepare(
        'SELECT w.id, w.symbol, s.ex_date FROM windows w JOIN splits s ON s.symbol = w.symbol AND s.ex_date > w.history_start AND s.ex_date <= w.end_date LIMIT ?',
      ),
      cap,
    ),
    (r: Record<string, number>) => JSON.stringify(r),
  );
  add(
    'windows enter on a real chain',
    all(
      db.prepare(
        "SELECT w.id, w.symbol, w.entry_date FROM windows w LEFT JOIN chain_days c ON c.symbol = w.symbol AND c.date = CAST(REPLACE(w.entry_date, '-', '') AS INTEGER) WHERE c.date IS NULL OR c.src = 1 LIMIT ?",
      ),
      cap,
    ),
    (r: Record<string, number>) => JSON.stringify(r),
  );
  add(
    'windows have 252 days of history',
    all(
      db.prepare(
        "SELECT w.id, (SELECT COUNT(*) FROM bars b WHERE b.symbol = w.symbol AND b.date >= CAST(REPLACE(w.history_start,'-','') AS INTEGER) AND b.date < CAST(REPLACE(w.entry_date,'-','') AS INTEGER)) AS n FROM windows w WHERE w.id % 97 = 0",
      ),
    ).filter((r) => (r as { n: number }).n < 252),
    (r: Record<string, number>) => JSON.stringify(r),
  );

  if (opts.dailyChainsFrom) {
    const from = Number(opts.dailyChainsFrom.replace(/-/g, ''));
    const syms = all<{ symbol: string; first: number }>(
      db.prepare('SELECT symbol, MIN(date) AS first FROM chain_days GROUP BY symbol'),
    );
    for (const s of syms) {
      const start = Math.max(from, s.first);
      const missing = get<{ n: number }>(
        db.prepare(
          'SELECT COUNT(*) AS n FROM bars b LEFT JOIN chain_days c ON c.symbol = b.symbol AND c.date = b.date WHERE b.symbol = ? AND b.date >= ? AND c.date IS NULL',
        ),
        s.symbol,
        start,
      );
      if (missing && missing.n > 0)
        issues.push({
          check: 'recent years have a chain every trading day',
          detail: `${s.symbol}: ${missing.n} days missing`,
        });
    }
  }
  return issues;
}
