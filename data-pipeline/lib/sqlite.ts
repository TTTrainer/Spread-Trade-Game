/**
 * Thin wrapper over Node/Electron's built-in SQLite (node:sqlite). No native module to
 * compile, and the same code runs in the game, the tests and the data scripts.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type * as NodeSqlite from 'node:sqlite';
import type { DatabaseSync as DatabaseSyncType, StatementSync } from 'node:sqlite';

type SqliteModule = typeof NodeSqlite;

let mod: SqliteModule | null = null;

function sqlite(): SqliteModule {
  if (!mod) {
    // Silence the one-time "SQLite is experimental" warning; the API is stable enough for us.
    const origEmit = process.emitWarning;
    process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
      const msg = typeof warning === 'string' ? warning : warning.message;
      if (msg.includes('SQLite')) return;
      (origEmit as (...a: unknown[]) => void).call(process, warning, ...rest);
    }) as typeof process.emitWarning;
    const req = createRequire(import.meta.url);
    mod = req('node:sqlite') as SqliteModule;
    process.emitWarning = origEmit;
  }
  return mod;
}

export type Db = DatabaseSyncType;
export type Stmt = StatementSync;
export type SqlValue = null | number | bigint | string | Uint8Array;

export function openDb(path: string, opts: { readOnly?: boolean } = {}): Db {
  if (!opts.readOnly && path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const { DatabaseSync } = sqlite();
  const db = new DatabaseSync(path, { readOnly: opts.readOnly ?? false });
  if (!opts.readOnly) {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }
  db.exec('PRAGMA temp_store = MEMORY;');
  db.exec('PRAGMA cache_size = -65536;');
  return db;
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function all<T>(stmt: Stmt, ...params: SqlValue[]): T[] {
  return stmt.all(...params) as T[];
}

export function get<T>(stmt: Stmt, ...params: SqlValue[]): T | undefined {
  return stmt.get(...params) as T | undefined;
}
