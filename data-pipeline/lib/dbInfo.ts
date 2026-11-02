import { existsSync } from 'node:fs';
import { get, openDb } from './sqlite';

export interface DbInfo {
  kind: string | null;
  lastDate: string | null;
  /** Built from schwab.db (chains modeled from price history). */
  fromSchwab: boolean;
  tickers: string[];
}

/** What a game.db holds, read without keeping it open (so it can be replaced right after). */
export function dbInfo(path: string): DbInfo {
  if (!existsSync(path)) return { kind: null, lastDate: null, fromSchwab: false, tickers: [] };
  let db: ReturnType<typeof openDb> | null = null;
  try {
    db = openDb(path, { readOnly: true });
    const meta = JSON.parse(
      get<{ value: string }>(db.prepare("SELECT value FROM meta WHERE key='dataset'"))?.value ?? '{}',
    ) as { kind?: string; lastDate?: string; chainModel?: string };
    const tickers = (db.prepare('SELECT symbol FROM symbols').all() as { symbol: string }[]).map(
      (r) => r.symbol,
    );
    return {
      kind: meta.kind ?? null,
      lastDate: meta.lastDate ?? null,
      fromSchwab: meta.chainModel === 'history',
      tickers,
    };
  } catch {
    // A damaged or half-written file counts as no data, so a fresh download can replace it.
    return { kind: null, lastDate: null, fromSchwab: false, tickers: [] };
  } finally {
    db?.close();
  }
}
