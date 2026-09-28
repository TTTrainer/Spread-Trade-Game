import { statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { tradingDaysBetween } from '../src/engine/calendar';
import type { DatasetMeta } from '../src/engine/market/types';
import { all, get, openDb } from './lib/sqlite';
import { decDate } from './lib/schema';
import { validateGameDb } from './validate';

/** Writes data/REPORT.md: tickers and why, date ranges, row counts, % modeled, gaps, size, validation. */
export function writeReport(gameDbPath: string, outPath: string, extraNotes: string[] = []): string {
  const db = openDb(gameDbPath, { readOnly: true });
  const meta = JSON.parse(
    get<{ value: string }>(db.prepare("SELECT value FROM meta WHERE key='dataset'"))?.value ?? '{}',
  ) as DatasetMeta;
  const syms = all<{
    symbol: string;
    name: string;
    sector: string;
    kind: string;
    reason: string;
    liquidity: number | null;
    iv_level: number | null;
  }>(
    db.prepare('SELECT symbol, name, sector, kind, reason, liquidity, iv_level FROM symbols ORDER BY symbol'),
  );
  const count = (sql: string) => get<{ n: number }>(db.prepare(sql))?.n ?? 0;
  const lines: string[] = [];
  lines.push('# Market data report', '');
  lines.push(`Generated ${new Date().toISOString()} from \`${gameDbPath}\`.`, '');
  lines.push(
    `- **Dataset:** ${meta.kind === 'synthetic' ? 'SIM (synthetic, fictional companies)' : meta.kind} (built ${meta.builtAt})`,
  );
  lines.push(`- **Range:** ${meta.firstDate} to ${meta.lastDate}`);
  lines.push(`- **Benchmark:** ${meta.benchmark}; context: ${meta.context?.join(', ')}`);
  const size = existsSync(gameDbPath) ? statSync(gameDbPath).size : 0;
  lines.push(`- **Database size:** ${(size / 1e9).toFixed(2)} GB (target under 3 GB)`);
  for (const n of [...(meta.notes ?? []), ...extraNotes]) lines.push(`- ${n}`);
  lines.push('', '## Row counts', '');
  lines.push('| Table | Rows |', '|---|---|');
  for (const t of [
    'symbols',
    'bars',
    'chains',
    'chain_days',
    'vol',
    'earnings',
    'dividends',
    'splits',
    'rates',
    'vix',
    'macro_events',
    'fundamentals',
    'windows',
  ]) {
    lines.push(`| ${t} | ${count(`SELECT COUNT(*) AS n FROM ${t}`).toLocaleString('en-US')} |`);
  }
  lines.push('', '## Tickers', '');
  lines.push(
    '| Symbol | Name | Sector | Why | Bars | First chain | Chain days | % modeled | Bar gaps | Liquidity (spread/mid) | Median IV |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  );
  for (const s of syms) {
    const range = get<{ a: number; b: number; n: number }>(
      db.prepare('SELECT MIN(date) a, MAX(date) b, COUNT(*) n FROM bars WHERE symbol = ?'),
      s.symbol,
    );
    const cd = get<{ a: number | null; n: number; m: number }>(
      db.prepare('SELECT MIN(date) a, COUNT(*) n, SUM(src = 1) m FROM chain_days WHERE symbol = ?'),
      s.symbol,
    );
    let gaps = 0;
    if (range && range.n > 0) {
      const expected = tradingDaysBetween(decDate(range.a), decDate(range.b)).length;
      gaps = expected - range.n;
    }
    const pct = cd && cd.n > 0 ? ((100 * (cd.m ?? 0)) / cd.n).toFixed(1) : '-';
    lines.push(
      `| ${s.symbol} | ${s.name} | ${s.sector} | ${s.reason} | ${range ? `${decDate(range.a)} to ${decDate(range.b)}` : '-'} | ${cd?.a ? decDate(cd.a) : '-'} | ${cd?.n ?? 0} | ${pct} | ${gaps} | ${s.liquidity === null ? '-' : (100 * s.liquidity).toFixed(1) + '%'} | ${s.iv_level === null ? '-' : (100 * s.iv_level).toFixed(0) + '%'} |`,
    );
  }
  const wins = get<{ n: number; r: number }>(db.prepare('SELECT COUNT(*) n, SUM(recent) r FROM windows'));
  lines.push('', '## Windows', '');
  lines.push(
    `${wins?.n ?? 0} dealable windows; ${wins?.r ?? 0} from the last three years (dealt 75% of the time).`,
    '',
  );
  const regimes: [string, string][] = [
    ['Earnings inside window', 'has_earnings = 1'],
    ['FOMC inside window', 'has_fomc = 1'],
    ['Ex-dividend inside window', 'has_exdiv = 1'],
    ['ADX < 18 (chop)', 'adx < 18'],
    ['ADX > 30 (trend)', 'adx > 30'],
    ['VIX > 25', 'vix > 25'],
    ['IVR < 15', 'ivr < 15'],
    ['Gap > 2 ATR', 'max_gap_atr > 2'],
    ['Widest spread decile', 'spread_decile >= 9'],
  ];
  lines.push('| Review filter | Windows |', '|---|---|');
  for (const [label, where] of regimes)
    lines.push(`| ${label} | ${count(`SELECT COUNT(*) n FROM windows WHERE ${where}`)} |`);
  const macroUnverified = count('SELECT COUNT(*) n FROM macro_events WHERE verified = 0');
  lines.push('', '## Macro calendar', '');
  lines.push(
    `${count('SELECT COUNT(*) n FROM macro_events')} FOMC and CPI dates. ${macroUnverified} are unverified: they were compiled offline because federalreserve.gov and bls.gov were unreachable from the build machine.`,
  );
  const issues = validateGameDb(db);
  lines.push('', '## Validation', '');
  if (issues.length === 0) lines.push('All checks passed.');
  else for (const i of issues) lines.push(`- **${i.check}:** ${i.detail}`);
  db.close();
  const text = lines.join('\n') + '\n';
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text, 'utf8');
  return text;
}
