/**
 * user.db: settings, saves, the trade ledger, drills and run history. Everything the player
 * owns lives here (market data stays read-only in game.db).
 */
import { openDb, type Db } from '../../data-pipeline/lib/sqlite';
import type { TradeRow, DrillRow, RunRow, SaveSlot } from '../../src/shared/userData';
import { addHandlers } from './ipc';
import { userDbPath } from './paths';

const DDL = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS saves (slot TEXT PRIMARY KEY, kind TEXT NOT NULL, updated_at TEXT NOT NULL, summary TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY, mode TEXT NOT NULL, run_id TEXT, desk TEXT, closed_on TEXT NOT NULL, opened_on TEXT NOT NULL,
  symbol TEXT NOT NULL, display_symbol TEXT NOT NULL, structure TEXT NOT NULL, qty INTEGER NOT NULL,
  realized_cents INTEGER NOT NULL, risk_cents INTEGER NOT NULL, benchmark_cents INTEGER NOT NULL, alpha_cents INTEGER NOT NULL,
  exit_reason TEXT NOT NULL, grade TEXT NOT NULL, tags TEXT NOT NULL, call_bucket INTEGER, call_conf REAL, call_actual INTEGER,
  brier REAL, regime TEXT NOT NULL, recorded_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trades_closed ON trades(closed_on);
CREATE TABLE IF NOT EXISTS drills (id TEXT PRIMARY KEY, kind TEXT NOT NULL, at TEXT NOT NULL, score REAL NOT NULL, detail TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, mode TEXT NOT NULL, desk TEXT NOT NULL, seed TEXT NOT NULL, tier INTEGER NOT NULL,
  started_at TEXT NOT NULL, ended_at TEXT, result TEXT NOT NULL, rounds INTEGER NOT NULL, score REAL NOT NULL,
  cal_grade TEXT, alpha_cents INTEGER NOT NULL, xp INTEGER NOT NULL, bonus INTEGER NOT NULL, data TEXT NOT NULL
);
`;

let db: Db | null = null;

function handle(): Db {
  if (!db) {
    db = openDb(process.env.STG_USER_DB ?? userDbPath());
    db.exec(DDL);
  }
  return db;
}

export function registerUserHandlers(): void {
  addHandlers({
    'user.get': (key: string) => {
      const row = handle().prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
      return row ? (JSON.parse(row.value) as unknown) : null;
    },
    'user.set': (key: string, value: unknown) => {
      handle().prepare('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
    },
    'user.save': (slot: SaveSlot) => {
      handle()
        .prepare('INSERT OR REPLACE INTO saves(slot, kind, updated_at, summary, data) VALUES (?,?,?,?,?)')
        .run(slot.slot, slot.kind, slot.updatedAt, JSON.stringify(slot.summary), JSON.stringify(slot.data));
    },
    'user.load': (slot: string) => {
      const r = handle().prepare('SELECT * FROM saves WHERE slot = ?').get(slot) as Record<string, string> | undefined;
      return r ? { slot: r.slot, kind: r.kind as SaveSlot['kind'], updatedAt: r.updated_at, summary: JSON.parse(r.summary) as Record<string, unknown>, data: JSON.parse(r.data) as unknown } : null;
    },
    'user.deleteSave': (slot: string) => {
      handle().prepare('DELETE FROM saves WHERE slot = ?').run(slot);
    },
    'user.listSaves': () =>
      (handle().prepare('SELECT slot, kind, updated_at, summary FROM saves ORDER BY updated_at DESC').all() as Record<string, string>[]).map((r) => ({
        slot: r.slot,
        kind: r.kind as SaveSlot['kind'],
        updatedAt: r.updated_at,
        summary: JSON.parse(r.summary) as Record<string, unknown>,
      })),
    'user.recordTrade': (t: TradeRow) => {
      handle()
        .prepare(
          `INSERT OR REPLACE INTO trades(id, mode, run_id, desk, closed_on, opened_on, symbol, display_symbol, structure, qty, realized_cents, risk_cents,
           benchmark_cents, alpha_cents, exit_reason, grade, tags, call_bucket, call_conf, call_actual, brier, regime, recorded_at, data)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          t.id,
          t.mode,
          t.runId,
          t.desk,
          t.closedOn,
          t.openedOn,
          t.symbol,
          t.displaySymbol,
          t.structure,
          t.qty,
          t.realizedCents,
          t.riskCents,
          t.benchmarkCents,
          t.alphaCents,
          t.exitReason,
          t.grade,
          JSON.stringify(t.tags),
          t.callBucket,
          t.callConf,
          t.callActual,
          t.brier,
          JSON.stringify(t.regime),
          t.recordedAt,
          JSON.stringify(t.data ?? {}),
        );
    },
    'user.trades': () =>
      (handle().prepare('SELECT * FROM trades ORDER BY closed_on, recorded_at').all() as Record<string, string | number | null>[]).map(
        (r): TradeRow => ({
          id: String(r.id),
          mode: String(r.mode) as TradeRow['mode'],
          runId: r.run_id === null ? null : String(r.run_id),
          desk: r.desk === null ? null : String(r.desk),
          closedOn: String(r.closed_on),
          openedOn: String(r.opened_on),
          symbol: String(r.symbol),
          displaySymbol: String(r.display_symbol),
          structure: String(r.structure),
          qty: Number(r.qty),
          realizedCents: Number(r.realized_cents),
          riskCents: Number(r.risk_cents),
          benchmarkCents: Number(r.benchmark_cents),
          alphaCents: Number(r.alpha_cents),
          exitReason: String(r.exit_reason),
          grade: String(r.grade),
          tags: JSON.parse(String(r.tags)) as string[],
          callBucket: r.call_bucket === null ? null : Number(r.call_bucket),
          callConf: r.call_conf === null ? null : Number(r.call_conf),
          callActual: r.call_actual === null ? null : Number(r.call_actual),
          brier: r.brier === null ? null : Number(r.brier),
          regime: JSON.parse(String(r.regime)) as TradeRow['regime'],
          recordedAt: String(r.recorded_at),
          data: JSON.parse(String(r.data)) as Record<string, unknown>,
        }),
      ),
    'user.recordDrill': (d: DrillRow) => {
      handle().prepare('INSERT OR REPLACE INTO drills(id, kind, at, score, detail) VALUES (?,?,?,?,?)').run(d.id, d.kind, d.at, d.score, JSON.stringify(d.detail));
    },
    'user.drills': () =>
      (handle().prepare('SELECT * FROM drills ORDER BY at').all() as Record<string, string | number>[]).map((r) => ({
        id: String(r.id),
        kind: String(r.kind),
        at: String(r.at),
        score: Number(r.score),
        detail: JSON.parse(String(r.detail)) as Record<string, unknown>,
      })),
    'user.recordRun': (r: RunRow) => {
      handle()
        .prepare(
          'INSERT OR REPLACE INTO runs(id, mode, desk, seed, tier, started_at, ended_at, result, rounds, score, cal_grade, alpha_cents, xp, bonus, data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(r.id, r.mode, r.desk, r.seed, r.tier, r.startedAt, r.endedAt, r.result, r.rounds, r.score, r.calGrade, r.alphaCents, r.xp, r.bonus, JSON.stringify(r.data ?? {}));
    },
    'user.runs': () =>
      (handle().prepare('SELECT * FROM runs ORDER BY started_at').all() as Record<string, string | number | null>[]).map((r) => ({
        id: String(r.id),
        mode: String(r.mode),
        desk: String(r.desk),
        seed: String(r.seed),
        tier: Number(r.tier),
        startedAt: String(r.started_at),
        endedAt: r.ended_at === null ? null : String(r.ended_at),
        result: String(r.result),
        rounds: Number(r.rounds),
        score: Number(r.score),
        calGrade: r.cal_grade === null ? null : String(r.cal_grade),
        alphaCents: Number(r.alpha_cents),
        xp: Number(r.xp),
        bonus: Number(r.bonus),
        data: JSON.parse(String(r.data)) as Record<string, unknown>,
      })),
  });
}
