/**
 * Career statistics from the real ledger (closed trades as recorded), never from the arcade
 * meter. Pure functions so every number on the Stats screen has a test.
 */

import { brier, calibrationGrade, type Grade } from '../scoring/calls';
import type { Cents } from '../money';

/** The shape stats need (a subset of the user.db trade row). */
export interface LedgerTrade {
  id: string;
  mode: string;
  desk: string | null;
  closedOn: string;
  openedOn: string;
  symbol: string;
  structure: string;
  realizedCents: Cents;
  riskCents: Cents;
  benchmarkCents: Cents;
  alphaCents: Cents;
  grade: string;
  tags: string[];
  callBucket: number | null;
  callConf: number | null;
  callActual: number | null;
  brier: number | null;
  regime: {
    vix: number | null;
    ivr: number | null;
    trend: number | null;
    adx: number | null;
    earnings: boolean;
  };
}

export interface Summary {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalCents: Cents;
  expectancyCents: number;
  avgWinCents: number;
  avgLossCents: number;
  profitFactor: number | null; // gross wins / gross losses; null when there are no losses
  benchmarkCents: Cents;
  alphaCents: Cents;
  avgReturnOnRisk: number;
  maxDrawdownCents: Cents;
  bestCents: Cents;
  worstCents: Cents;
}

export function summarize(rows: LedgerTrade[]): Summary {
  const wins = rows.filter((r) => r.realizedCents > 0);
  const losses = rows.filter((r) => r.realizedCents < 0);
  const gw = wins.reduce((a, r) => a + r.realizedCents, 0);
  const gl = -losses.reduce((a, r) => a + r.realizedCents, 0);
  const total = rows.reduce((a, r) => a + r.realizedCents, 0);
  let peak = 0;
  let cum = 0;
  let dd = 0;
  for (const r of sortByClose(rows)) {
    cum += r.realizedCents;
    peak = Math.max(peak, cum);
    dd = Math.max(dd, peak - cum);
  }
  const ror = rows.filter((r) => r.riskCents > 0).map((r) => r.realizedCents / r.riskCents);
  return {
    trades: rows.length,
    wins: wins.length,
    losses: losses.length,
    winRate: rows.length ? wins.length / rows.length : 0,
    totalCents: total,
    expectancyCents: rows.length ? total / rows.length : 0,
    avgWinCents: wins.length ? gw / wins.length : 0,
    avgLossCents: losses.length ? -gl / losses.length : 0,
    profitFactor: gl > 0 ? gw / gl : null,
    benchmarkCents: rows.reduce((a, r) => a + r.benchmarkCents, 0),
    alphaCents: rows.reduce((a, r) => a + r.alphaCents, 0),
    avgReturnOnRisk: ror.length ? ror.reduce((a, b) => a + b, 0) / ror.length : 0,
    maxDrawdownCents: dd,
    bestCents: rows.length ? Math.max(...rows.map((r) => r.realizedCents)) : 0,
    worstCents: rows.length ? Math.min(...rows.map((r) => r.realizedCents)) : 0,
  };
}

export function sortByClose(rows: LedgerTrade[]): LedgerTrade[] {
  return rows
    .slice()
    .sort((a, b) => (a.closedOn < b.closedOn ? -1 : a.closedOn > b.closedOn ? 1 : a.id < b.id ? -1 : 1));
}

export type BreakdownKey =
  'structure' | 'desk' | 'symbol' | 'vix' | 'ivr' | 'trend' | 'earnings' | 'mode' | 'grade';

export function regimeLabel(r: LedgerTrade, key: 'vix' | 'ivr' | 'trend' | 'earnings'): string {
  switch (key) {
    case 'vix': {
      const v = r.regime.vix;
      return v === null
        ? 'VIX unknown'
        : v < 15
          ? 'VIX < 15 (calm)'
          : v <= 25
            ? 'VIX 15-25'
            : 'VIX > 25 (stressed)';
    }
    case 'ivr': {
      const v = r.regime.ivr;
      return v === null
        ? 'IVR unknown'
        : v < 30
          ? 'IV rank < 30'
          : v <= 60
            ? 'IV rank 30-60'
            : 'IV rank > 60';
    }
    case 'trend': {
      const t = r.regime.trend;
      return t === null ? 'Trend unknown' : t > 0.03 ? 'Uptrend' : t < -0.03 ? 'Downtrend' : 'Sideways';
    }
    case 'earnings':
      return r.regime.earnings ? 'Earnings inside' : 'No earnings';
  }
}

export function keyOf(r: LedgerTrade, key: BreakdownKey): string {
  switch (key) {
    case 'structure':
      return r.structure;
    case 'desk':
      return r.desk ?? 'none';
    case 'symbol':
      return r.symbol;
    case 'mode':
      return r.mode;
    case 'grade':
      return r.grade;
    default:
      return regimeLabel(r, key);
  }
}

export function breakdown(rows: LedgerTrade[], key: BreakdownKey): { key: string; summary: Summary }[] {
  const groups = new Map<string, LedgerTrade[]>();
  for (const r of rows) {
    const k = keyOf(r, key);
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  return [...groups.entries()]
    .map(([k, list]) => ({ key: k, summary: summarize(list) }))
    .sort((a, b) => b.summary.trades - a.summary.trades);
}

export interface CalibrationPoint {
  confidence: number;
  n: number;
  hitRate: number;
}

export function calibration(rows: LedgerTrade[]): {
  points: CalibrationPoint[];
  meanBrier: number | null;
  grade: Grade;
  calls: number;
} {
  const calls = rows.filter((r) => r.callBucket !== null && r.callConf !== null && r.callActual !== null);
  const points = [0.5, 0.6, 0.7, 0.8, 0.9].map((c) => {
    const xs = calls.filter((r) => Math.abs((r.callConf as number) - c) < 1e-6);
    return {
      confidence: c,
      n: xs.length,
      hitRate: xs.length ? xs.filter((r) => r.callBucket === r.callActual).length / xs.length : 0,
    };
  });
  const scores = calls.map(
    (r) =>
      r.brier ??
      brier(
        { bucket: r.callBucket as 0 | 1 | 2 | 3 | 4, confidence: r.callConf as number },
        r.callActual as 0 | 1 | 2 | 3 | 4,
      ),
  );
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  return { points, meanBrier: mean, grade: calibrationGrade(mean), calls: calls.length };
}

export interface EquityPoint {
  index: number;
  date: string;
  cumCents: Cents;
  benchCents: Cents;
  alphaCents: Cents;
}

export function equityCurve(rows: LedgerTrade[]): EquityPoint[] {
  let cum = 0;
  let bench = 0;
  return sortByClose(rows).map((r, i) => {
    cum += r.realizedCents;
    bench += r.benchmarkCents;
    return { index: i + 1, date: r.closedOn, cumCents: cum, benchCents: bench, alphaCents: cum - bench };
  });
}

/** How often each mistake tag appears in consecutive blocks of trades (oldest block first). */
export function mistakeTrends(
  rows: LedgerTrade[],
  blockSize = 10,
  maxBlocks = 8,
): { blocks: { label: string; n: number }[]; rates: Record<string, number[]> } {
  const sorted = sortByClose(rows);
  const blocks: LedgerTrade[][] = [];
  for (let i = 0; i < sorted.length; i += blockSize) blocks.push(sorted.slice(i, i + blockSize));
  const shown = blocks.slice(-maxBlocks);
  const offset = blocks.length - shown.length;
  const tags = new Set<string>();
  for (const r of sorted) for (const t of r.tags) tags.add(t);
  const rates: Record<string, number[]> = {};
  for (const t of tags)
    rates[t] = shown.map((b) => (b.length ? b.filter((r) => r.tags.includes(t)).length / b.length : 0));
  return {
    blocks: shown.map((b, i) => ({
      label: `#${(offset + i) * blockSize + 1}-${(offset + i) * blockSize + b.length}`,
      n: b.length,
    })),
    rates,
  };
}

const CSV_COLUMNS: [string, (r: LedgerTrade) => string | number | null][] = [
  ['Closed', (r) => r.closedOn],
  ['Opened', (r) => r.openedOn],
  ['Mode', (r) => r.mode],
  ['Desk', (r) => r.desk],
  ['Ticker', (r) => r.symbol],
  ['Structure', (r) => r.structure],
  ['P/L ($)', (r) => (r.realizedCents / 100).toFixed(2)],
  ['Max risk ($)', (r) => (r.riskCents / 100).toFixed(2)],
  ['Return on risk (%)', (r) => (r.riskCents ? ((100 * r.realizedCents) / r.riskCents).toFixed(1) : '')],
  ['Benchmark ($)', (r) => (r.benchmarkCents / 100).toFixed(2)],
  ['Alpha ($)', (r) => (r.alphaCents / 100).toFixed(2)],
  ['Process grade', (r) => r.grade],
  ['Mistake tags', (r) => r.tags.join('; ')],
  ['Call bucket', (r) => r.callBucket],
  ['Call confidence', (r) => r.callConf],
  ['Actual bucket', (r) => r.callActual],
  ['Brier', (r) => (r.brier === null ? '' : r.brier.toFixed(4))],
  ['VIX', (r) => r.regime.vix],
  ['IV rank', (r) => r.regime.ivr],
  ['Earnings inside', (r) => (r.regime.earnings ? 'yes' : 'no')],
];

function csvField(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with a UTF-8 byte-order mark and CRLF lines, so Excel opens it cleanly. */
export function toCsv(rows: LedgerTrade[]): string {
  const lines = [CSV_COLUMNS.map(([h]) => csvField(h)).join(',')];
  for (const r of sortByClose(rows)) lines.push(CSV_COLUMNS.map(([, f]) => csvField(f(r))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
