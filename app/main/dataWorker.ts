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
import { schwabFetchApi } from '../../data-pipeline/schwab/client';
import { keepLaterDays, schwabTopUp } from '../../data-pipeline/schwab/topup';

interface Job {
  req: DataBuildRequest;
  gameDbPath: string;
  doltRoot: string;
  reportPath: string;
  /** A short-lived Schwab access token when the player connected Schwab (never saved here). */
  schwabToken?: string | null;
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
  try {
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
    if (!existsSync(gameDbPath)) return { ok: false, message: 'Build the real market data first.' };
    const db = openDb(gameDbPath, { readOnly: true });
    const meta = JSON.parse(
      get<{ value: string }>(db.prepare("SELECT value FROM meta WHERE key='dataset'"))?.value ?? '{}',
    ) as { kind: string; lastDate: string };
    const tickers = (db.prepare('SELECT symbol FROM symbols').all() as { symbol: string }[]).map(
      (r) => r.symbol,
    );
    db.close();
    if (meta.kind !== 'real')
      return { ok: false, message: 'Sync needs the real market data. Build it first.' };
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
        const t = await schwabTopUp({
          gameDbPath,
          api: schwabFetchApi(job.schwabToken),
          log,
          progress: (s, f) => progress(s, f),
        });
        notes.push(t.message);
        ok = ok || t.ok;
      } catch (e) {
        notes.push(`Schwab top-up failed (${e instanceof Error ? e.message : String(e)}).`);
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
