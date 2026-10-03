/**
 * Runs inside an Electron utility process: builds or syncs game.db without blocking the game.
 * Builds into a temporary file and swaps it in only on success.
 */
import { existsSync, renameSync, rmSync } from 'node:fs';
import { addDays } from '../../src/engine/calendar';
import type { DataBuildRequest, DataBuildResult } from '../../src/shared/rpc';
import { buildRealDb, LowDiskError } from '../../data-pipeline/dolt/extract';
import { get, openDb } from '../../data-pipeline/lib/sqlite';
import { writeReport } from '../../data-pipeline/report';
import { buildSyntheticDb } from '../../data-pipeline/synthetic';
import { CANDIDATES } from '../../data-pipeline/dolt/tickers';
import { downloadVix } from '../../data-pipeline/vix';
import { buildFromSchwab } from '../../data-pipeline/schwab/build';
import { schwabFetchApi } from '../../data-pipeline/schwab/client';
import { schwabPull } from '../../data-pipeline/schwab/pull';
import { keepLaterDays, schwabTopUp } from '../../data-pipeline/schwab/topup';

interface Job {
  req: DataBuildRequest;
  gameDbPath: string;
  doltRoot: string;
  reportPath: string;
  /** schwab.db: what PULL FROM SCHWAB saved (a separate file next to game.db). */
  schwabStorePath: string;
  /** A short-lived Schwab access token when the player connected Schwab (never saved here). */
  schwabToken?: string | null;
}

interface DbInfo {
  kind: string | null;
  lastDate: string | null;
  /** Built from schwab.db (chains modeled from price history). */
  fromSchwab: boolean;
  tickers: string[];
}

function dbInfo(path: string): DbInfo {
  if (!existsSync(path)) return { kind: null, lastDate: null, fromSchwab: false, tickers: [] };
  const db = openDb(path, { readOnly: true });
  try {
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
  } finally {
    db.close();
  }
}

interface ParentPort {
  on(event: 'message', cb: (e: { data: Job }) => void): void;
  postMessage(msg: unknown): void;
}

const port = (process as unknown as { parentPort: ParentPort }).parentPort;

function progress(stage: string, fraction: number, message = ''): void {
  port.postMessage({ type: 'progress', stage, fraction, message });
}

function swapIn(tmp: string, target: string): void {
  for (const s of ['', '-wal', '-shm']) if (existsSync(target + s)) rmSync(target + s);
  renameSync(tmp, target);
  for (const s of ['-wal', '-shm']) if (existsSync(tmp + s)) rmSync(tmp + s);
}

async function run(job: Job): Promise<DataBuildResult> {
  const { req, gameDbPath } = job;
  const log = (m: string) => {
    console.log(m);
    progress('log', -1, m);
  };
  /** Save Schwab's newest prices (and closing chains) into schwab.db. */
  const pull = async (): Promise<string> => {
    if (!job.schwabToken) throw new Error('Connect Schwab first (steps 1 to 3 above).');
    const info = dbInfo(gameDbPath);
    const symbols = [
      ...new Set([...CANDIDATES.map((c) => c.symbol), ...(info.kind === 'real' ? info.tickers : [])]),
    ];
    const r = await schwabPull({
      storePath: job.schwabStorePath,
      api: schwabFetchApi(job.schwabToken),
      symbols,
      log,
      progress: (s, f) => progress(s, f),
    });
    return r.message;
  };
  /** game.db from schwab.db: DoltHub data gets the newest days added; anything else is rebuilt. */
  const fromStore = async (): Promise<string> => {
    if (!existsSync(job.schwabStorePath))
      throw new Error('Nothing pulled yet. Click PULL FROM SCHWAB first.');
    const info = dbInfo(gameDbPath);
    if (info.kind === 'real' && !info.fromSchwab) {
      const t = await schwabTopUp({
        gameDbPath,
        storePath: job.schwabStorePath,
        log,
        progress: (s, f) => progress(s, f),
      });
      return t.message;
    }
    const tmp = `${gameDbPath}.building`;
    if (existsSync(tmp)) rmSync(tmp);
    const r = await buildFromSchwab({
      storePath: job.schwabStorePath,
      gameDbPath: tmp,
      vixFallback: downloadVix,
      log,
      progress: (s, f) => progress(s, f),
    });
    swapIn(tmp, gameDbPath);
    return r.message;
  };
  try {
    if (req.mode === 'schwabPull') {
      const message = await pull();
      return { ok: true, message };
    }
    if (req.mode === 'schwabBuild') {
      const message = await fromStore();
      writeReport(gameDbPath, job.reportPath);
      return { ok: true, message };
    }
    if (req.mode === 'synthetic') {
      const tmp = `${gameDbPath}.building`;
      if (existsSync(tmp)) rmSync(tmp);
      const r = await buildSyntheticDb({ path: tmp, progress: (m, f) => progress(m, f) });
      swapIn(tmp, gameDbPath);
      writeReport(gameDbPath, job.reportPath);
      return { ok: true, message: `SIM market written: ${r.symbols} symbols, ${r.windows} windows.` };
    }
    if (req.mode === 'real') {
      const tmp = `${gameDbPath}.building`;
      if (existsSync(tmp)) rmSync(tmp);
      const r = await buildRealDb({
        gameDbPath: tmp,
        doltRoot: job.doltRoot,
        allowDownload: req.allowDownload,
        confirmLowDisk: req.confirmLowDisk,
        log,
        progress: (s, f) => progress(s, f),
      });
      swapIn(tmp, gameDbPath);
      writeReport(gameDbPath, job.reportPath);
      return {
        ok: true,
        message: `Real market data built: ${r.tickers.length} tickers through ${r.lastDate}.`,
      };
    }
    // sync
    const info = dbInfo(gameDbPath);
    // Data built from Schwab (or no real data yet, with Schwab connected): pull, then rebuild.
    if (info.fromSchwab || (info.kind !== 'real' && job.schwabToken)) {
      if (!job.schwabToken)
        return {
          ok: false,
          message: 'Your market data comes from Schwab: connect Schwab in Settings › Data to sync it.',
        };
      const pulled = await pull();
      const built = await fromStore();
      writeReport(gameDbPath, job.reportPath);
      return { ok: true, message: `${pulled} ${built}` };
    }
    if (info.kind !== 'real' || !info.lastDate)
      return { ok: false, message: 'Sync needs the real market data. Build it first.' };
    const meta = { lastDate: info.lastDate };
    const tickers = info.tickers;
    // DoltHub first (it is the reference data), then the newest days from Schwab when connected.
    const notes: string[] = [];
    let ok = false;
    try {
      const r = await buildRealDb({
        gameDbPath,
        doltRoot: job.doltRoot,
        allowDownload: req.allowDownload,
        confirmLowDisk: true,
        tickers,
        incrementalFrom: addDays(meta.lastDate, -10),
        log,
        progress: (s, f) => progress(s, f),
      });
      keepLaterDays(gameDbPath, meta.lastDate);
      notes.push(`DoltHub: synced through ${r.lastDate}.`);
      ok = true;
    } catch (e) {
      if (e instanceof LowDiskError || !job.schwabToken) throw e;
      notes.push(`DoltHub sync failed (${e instanceof Error ? e.message : String(e)}).`);
    }
    if (job.schwabToken) {
      try {
        notes.push(await pull());
        notes.push(await fromStore());
        ok = true;
      } catch (e) {
        notes.push(`Schwab failed (${e instanceof Error ? e.message : String(e)}).`);
      }
    }
    writeReport(gameDbPath, job.reportPath);
    return { ok, message: notes.join(' ') };
  } catch (e) {
    if (e instanceof LowDiskError) return { ok: false, message: e.message, needsDiskConfirm: true };
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

port.on('message', (e) => {
  void run(e.data).then((result) => {
    port.postMessage({ type: 'done', result });
    setTimeout(() => process.exit(0), 50);
  });
});
