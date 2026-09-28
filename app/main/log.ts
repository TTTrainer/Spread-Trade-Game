import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { logDir } from './paths';

/** Plain-text log Jacob can copy into a bug report (see README_PLAY.md). */
export function log(level: 'info' | 'warn' | 'error', message: string, detail?: unknown): void {
  const line = `${new Date().toISOString()} [${level}] ${message}${detail === undefined ? '' : ' ' + safeJson(detail)}\n`;
  try {
    appendFileSync(join(logDir(), 'game.log'), line);
  } catch {
    // Logging must never crash the game.
  }
  if (level === 'error') console.error(line.trim());
}

function safeJson(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}\n${v.stack ?? ''}`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
