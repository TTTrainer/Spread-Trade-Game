/**
 * Keeps game.db current from the Options DB's published releases (see data-pipeline/download.ts).
 *
 * - First launch with no real data: the game downloads it and loads it straight away.
 * - Real data already here: a newer release downloads in the background into game.db.next and
 *   loads at the next launch (or right away with LOAD NOW in Settings › Data), so the market never
 *   changes under a round that is being played.
 * - DOWNLOAD LATEST DATA (Settings › Data) and SYNC on downloaded data load it right away.
 * Offline is fine: the check fails quietly and the game plays on what it has.
 */

import { net } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { dbInfo } from '../../data-pipeline/lib/dbInfo';
import {
  discardStaged,
  downloadGameDb,
  fetchManifest,
  installDownloaded,
  planUpdate,
  readSidecar,
  stagedDownload,
  type DataManifest,
  type FetchLike,
  type LocalData,
} from '../../data-pipeline/download';
import { writeReport } from '../../data-pipeline/report';
import type { DataBuildResult, DataUpdateStatus } from '../../src/shared/rpc';
import { gameDbPath, resetSource } from './dataService';
import { emit } from './ipc';
import { log } from './log';
import { userDataDir } from './paths';

// Chromium's network stack: it follows the PC's proxy and certificate settings, like a browser.
const netFetch: FetchLike = (url, init) => net.fetch(url, init) as unknown as Promise<Response>;

const stagedPath = () => `${gameDbPath()}.next`;
const reportPath = () => join(userDataDir(), 'data', 'REPORT.md');

let downloading: Promise<DataBuildResult> | null = null;
let last: {
  remote: DataManifest | null;
  plan: DataUpdateStatus['plan'];
  message: string;
  at: string;
} | null = null;

export const isDownloading = () => downloading !== null;

function localData(): LocalData {
  const p = gameDbPath();
  const i = dbInfo(p);
  return {
    kind: i.kind,
    lastDate: i.lastDate,
    fromSchwab: i.fromSchwab,
    downloaded: i.kind ? readSidecar(p) : null,
  };
}

/** game.db came from the Options DB (so SYNC means "download the newest release"). */
export function isDownloadedData(): boolean {
  return localData().downloaded !== null;
}

function short(m: DataManifest | null) {
  return m
    ? { version: m.version, firstDate: m.dateRange.first, lastDate: m.dateRange.last, size: m.size }
    : null;
}

export function updateStatus(): DataUpdateStatus {
  const local = localData();
  const staged = stagedDownload(stagedPath());
  return {
    remote: short(last?.remote ?? null),
    installed: short(local.downloaded),
    staged: short(staged),
    plan: last?.plan ?? 'unknown',
    message: last?.message ?? '',
    checkedAt: last?.at ?? null,
    busy: downloading !== null,
  };
}

async function check(
  manual: boolean,
): Promise<{ manifest: DataManifest; plan: ReturnType<typeof planUpdate> }> {
  try {
    const manifest = await fetchManifest({ fetch: netFetch, timeoutMs: manual ? 30_000 : 15_000 });
    const plan = planUpdate(localData(), manifest, { manual });
    last = { remote: manifest, plan: plan.action, message: plan.reason, at: new Date().toISOString() };
    return { manifest, plan };
  } catch (e) {
    const message = `Couldn't reach the Options DB (${(e as Error).message}).`;
    last = { remote: last?.remote ?? null, plan: 'offline', message, at: new Date().toISOString() };
    throw new Error(message);
  }
}

/** Download `manifest`'s game.db into game.db.next (once: an intact staged copy is reused). */
async function stage(manifest: DataManifest): Promise<void> {
  const have = stagedDownload(stagedPath());
  if (have?.sha256 === manifest.sha256) return;
  discardStaged(stagedPath());
  let shown = -1;
  await downloadGameDb({
    dest: stagedPath(),
    manifest,
    fetch: netFetch,
    progress: (f) => {
      const pct = Math.floor(f * 100);
      if (pct === shown) return;
      shown = pct;
      emit('data.progress', {
        stage: `Downloading game data ${manifest.version} from the Options DB`,
        message: '',
        fraction: f,
      });
    },
  });
}

/** Swap the staged download in. Only call this when nothing is mid-query on game.db. */
function apply(): string {
  const m = stagedDownload(stagedPath());
  if (!m) throw new Error('No downloaded data is waiting.');
  resetSource();
  try {
    installDownloaded(stagedPath(), gameDbPath());
  } finally {
    resetSource();
  }
  try {
    writeReport(gameDbPath(), reportPath());
  } catch (e) {
    log('warn', 'data report after download failed', e);
  }
  const n = dbInfo(gameDbPath()).tickers.length;
  log('info', `game data ${m.version} loaded (${n} tickers through ${m.dateRange.last})`);
  return `Market data ${m.version} loaded: ${n} tickers through ${m.dateRange.last}, from the Options DB.`;
}

/**
 * At launch, before anything opens game.db: load a download that finished last session, unless
 * the data here has since moved past it.
 */
export function applyStagedAtLaunch(): void {
  const p = stagedPath();
  const staged = stagedDownload(p);
  if (!staged) {
    if (existsSync(p) || existsSync(`${p}.part`)) discardStaged(p);
    return;
  }
  try {
    if (planUpdate(localData(), staged, { manual: true }).action === 'keep') {
      discardStaged(p);
      return;
    }
    apply();
  } catch (e) {
    log('error', 'could not load the downloaded game data; keeping the old', e);
  }
}

function once(job: () => Promise<DataBuildResult>): Promise<DataBuildResult> {
  if (downloading) return downloading;
  downloading = job().finally(() => {
    downloading = null;
  });
  return downloading;
}

/** DOWNLOAD LATEST DATA, and SYNC on downloaded data: fetch and load right away. */
export function downloadNow(): Promise<DataBuildResult> {
  return once(async () => {
    try {
      const { manifest, plan } = await check(true);
      if (plan.action === 'keep') return { ok: true, message: plan.reason };
      await stage(manifest);
      return { ok: true, message: apply() };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  });
}

/** LOAD NOW: the background download, without waiting for the next launch. */
export function applyNow(): Promise<DataBuildResult> {
  return once(async () => {
    try {
      return { ok: true, message: apply() };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  });
}

export async function recheck(): Promise<DataUpdateStatus> {
  try {
    await check(false);
  } catch {
    // The status says it couldn't reach the Options DB.
  }
  return updateStatus();
}

/** The quiet check at launch. Never throws; tells the screen only when something changed. */
export function autoUpdate(): void {
  if (process.env.STG_NO_DATA_UPDATE === '1') return;
  if (process.env.STG_E2E === '1' && !process.env.STG_DATA_URL) return;
  void once(async () => {
    try {
      const { manifest, plan } = await check(false);
      if (plan.action === 'keep') return { ok: true, message: plan.reason };
      await stage(manifest);
      if (plan.action === 'install') {
        const message = apply();
        emit('data.updated', { ok: true, message, staged: false });
        return { ok: true, message };
      }
      const message = `New market data through ${manifest.dateRange.last} downloaded. It loads the next time you start the game, or now with LOAD NOW in Settings › Data.`;
      emit('data.updated', { ok: true, message, staged: true });
      return { ok: true, message };
    } catch (e) {
      log('info', `data update check: ${(e as Error).message}`);
      return { ok: false, message: (e as Error).message };
    }
  });
}
