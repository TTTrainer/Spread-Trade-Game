import { utilityProcess } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkGate, GATE_RULES, type SourceMethod } from '../../src/engine/market/gate';
import type { MarketDataSource } from '../../src/engine/market/source';
import { SyntheticSource } from '../../src/engine/market/synthetic/source';
import { SqliteSource } from '../../data-pipeline/lib/sqliteSource';
import type { DataBuildRequest, DataBuildResult, DataStatus } from '../../src/shared/rpc';
import { addHandlers, emit } from './ipc';
import { log } from './log';
import { defaultGameDbPath, doltRootDir, schwabStorePath, userDataDir } from './paths';
import { schwabAccessToken } from './schwab';

const here = dirname(fileURLToPath(import.meta.url));

let source: MarketDataSource | null = null;
let usingBuiltDb = false;
let busy = false;
let gameDbPathOverride: string | null = null;

export function gameDbPath(): string {
  return gameDbPathOverride ?? process.env.STG_GAME_DB ?? defaultGameDbPath();
}

export function setGameDbPath(p: string | null): void {
  gameDbPathOverride = p;
  resetSource();
}

function resetSource(): void {
  if (source instanceof SqliteSource) source.close();
  source = null;
}

/** The built game.db when present; otherwise the SIM market, which needs no files at all. */
export function currentSource(): MarketDataSource {
  if (source) return source;
  const p = gameDbPath();
  if (existsSync(p) && process.env.STG_FORCE_SIM !== '1') {
    try {
      source = new SqliteSource(p);
      usingBuiltDb = true;
      log('info', `market data: ${p}`);
      return source;
    } catch (e) {
      log('error', 'could not open game.db, falling back to SIM', e);
    }
  }
  source = new SyntheticSource();
  usingBuiltDb = false;
  log('info', 'market data: SIM (no game.db)');
  return source;
}

async function status(): Promise<DataStatus> {
  const src = currentSource();
  const meta = await src.meta();
  const syms = await src.symbols();
  return {
    kind: meta.kind,
    usingBuiltDb,
    gameDbPath: gameDbPath(),
    gameDbExists: existsSync(gameDbPath()),
    lastDate: meta.lastDate,
    symbols: syms.length,
    notes: meta.notes,
    busy,
    fromSchwab: meta.chainModel === 'history',
  };
}

/** Builds run in a separate utility process so the game window never freezes. */
function runWorker(req: DataBuildRequest, schwabToken: string | null): Promise<DataBuildResult> {
  return new Promise((resolve) => {
    const child = utilityProcess.fork(join(here, 'dataWorker.js'), [], {
      serviceName: 'stg-data-build',
      stdio: 'pipe',
    });
    child.stdout?.on('data', (d: Buffer) => log('info', `[data] ${d.toString().trim()}`));
    child.stderr?.on('data', (d: Buffer) => log('warn', `[data] ${d.toString().trim()}`));
    child.on(
      'message',
      (msg: {
        type: string;
        stage?: string;
        message?: string;
        fraction?: number;
        result?: DataBuildResult;
      }) => {
        if (msg.type === 'progress')
          emit('data.progress', {
            stage: msg.stage ?? '',
            message: msg.message ?? '',
            fraction: msg.fraction ?? 0,
          });
        if (msg.type === 'done' && msg.result) resolve(msg.result);
      },
    );
    child.on('exit', (code) => {
      if (code !== 0)
        resolve({
          ok: false,
          message: `The data builder stopped unexpectedly (code ${code}). See the log folder.`,
        });
    });
    child.postMessage({
      req,
      gameDbPath: gameDbPath(),
      doltRoot: doltRootDir(),
      reportPath: join(userDataDir(), 'data', 'REPORT.md'),
      schwabStorePath: schwabStorePath(),
      // Only a short-lived access token crosses over; the worker never saves it.
      schwabToken,
    });
  });
}

export function registerDataHandlers(): void {
  addHandlers({
    'market.call': async (method: string, args: unknown[], asOf: string | null) => {
      if (!(method in GATE_RULES)) throw new Error(`Unknown market method ${method}`);
      const m = method as SourceMethod;
      // Defense in depth: the renderer's MarketView already gates, and so does this.
      if (GATE_RULES[m]) {
        if (!asOf) throw new Error(`${method} needs the caller's current date`);
        checkGate(m, args, asOf);
      }
      const src = currentSource() as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
      return src[m](...args);
    },
    'data.status': () => status(),
    'data.build': async (req: DataBuildRequest) => {
      if (busy) return { ok: false, message: 'A data build is already running.' };
      busy = true;
      try {
        resetSource();
        // A sync also pulls the newest days from Schwab when the player connected it.
        let token: string | null = null;
        let tokenNote = '';
        if (req.mode === 'sync' || req.mode === 'schwabPull')
          try {
            token = await schwabAccessToken();
          } catch (e) {
            tokenNote = ` Schwab: ${(e as Error).message}`;
          }
        const result = await runWorker(req, token);
        return tokenNote ? { ...result, message: result.message + tokenNote } : result;
      } finally {
        busy = false;
        resetSource();
      }
    },
    'data.report': () => {
      const p = join(userDataDir(), 'data', 'REPORT.md');
      return existsSync(p) ? readFileSync(p, 'utf8') : 'No report yet. Build market data first.';
    },
  });
}
