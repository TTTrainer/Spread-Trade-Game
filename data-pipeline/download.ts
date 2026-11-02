/**
 * DOWNLOAD GAME DATA: the finished game.db from the Options DB's public releases on GitHub
 * (TTTrainer/Options-DB-data), which the daily update republishes every weekday after the close.
 * Nothing has to be on this computer first: no DoltHub clone, no Schwab login, no schwab.db.
 * One file of about 30 MB, checked byte for byte (size and SHA-256) against the release manifest
 * before it replaces anything.
 *
 * It uses GitHub's plain release-download links rather than the GitHub API: the API allows 60
 * calls an hour without a login (shared by everyone on the same network) and fails outright on a
 * stale token, and the download links have neither problem.
 *
 * No Electron here: the game passes its own fetch (which follows the PC's proxy settings), and
 * the CLI and the tests use Node's.
 */

import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { ISODate } from '../src/engine/calendar';

export const DATA_REPO = 'TTTrainer/Options-DB-data';

/** Where the latest release's files are served (STG_DATA_URL points tests at a local server). */
export function releaseBaseUrl(): string {
  if (process.env.STG_DATA_URL) return process.env.STG_DATA_URL.replace(/\/+$/, '');
  return `https://github.com/${process.env.STG_DATA_REPO ?? DATA_REPO}/releases/latest/download`;
}

export interface DataManifest {
  version: string;
  tag: string;
  buildDate: string;
  size: number;
  sha256: string;
  dateRange: { first: ISODate; last: ISODate };
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<Response>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A release manifest, or an error saying what's wrong with it (nothing is downloaded then). */
export function parseManifest(json: unknown): DataManifest {
  const m = json as Partial<DataManifest> | null;
  const ok =
    !!m &&
    typeof m.version === 'string' &&
    Number.isInteger(m.size) &&
    (m.size as number) > 0 &&
    typeof m.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(m.sha256) &&
    typeof m.dateRange?.last === 'string' &&
    ISO.test(m.dateRange.last) &&
    typeof m.dateRange.first === 'string' &&
    ISO.test(m.dateRange.first);
  if (!ok) throw new Error('The published data has no valid manifest (version, size, hash, dates).');
  return {
    version: m.version as string,
    tag: typeof m.tag === 'string' ? m.tag : `data-${m.version}`,
    buildDate: typeof m.buildDate === 'string' ? m.buildDate : '',
    size: m.size as number,
    sha256: m.sha256 as string,
    dateRange: m.dateRange as DataManifest['dateRange'],
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Network trouble worth another try (a server error, a dropped connection, a stall). */
class RetryableError extends Error {}

async function get(fetchFn: FetchLike, url: string, signal: AbortSignal): Promise<Response> {
  let r: Response;
  try {
    r = await fetchFn(url, { signal, headers: { 'User-Agent': 'SpreadTradingGame' } });
  } catch (e) {
    throw new RetryableError(`couldn't reach ${new URL(url).host} (${(e as Error).message})`);
  }
  if (r.status === 404) throw new Error('No published game data found (the release has no such file).');
  if (r.status >= 500 || r.status === 429) throw new RetryableError(`the server answered ${r.status}`);
  if (!r.ok) throw new Error(`the server answered ${r.status}`);
  return r;
}

async function withRetries<T>(attempts: number, fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!(e instanceof RetryableError) || i === attempts - 1) break;
      await sleep(1000 * 2 ** i);
    }
  }
  throw last instanceof Error ? new Error(last.message) : new Error(String(last));
}

/** The latest release's manifest. Short timeout: this runs at every launch, often offline. */
export async function fetchManifest(
  opts: { fetch?: FetchLike; baseUrl?: string; timeoutMs?: number; attempts?: number } = {},
): Promise<DataManifest> {
  const fetchFn = opts.fetch ?? (fetch as FetchLike);
  const url = `${opts.baseUrl ?? releaseBaseUrl()}/manifest.json`;
  return withRetries(opts.attempts ?? 2, async () => {
    const signal = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
    const r = await get(fetchFn, url, signal);
    let json: unknown;
    try {
      json = await r.json();
    } catch {
      throw new Error('The published manifest is not valid JSON.');
    }
    return parseManifest(json);
  });
}

/**
 * Downloads game.db to `dest` and checks it against the manifest. It is written beside `dest`
 * first and renamed only once verified, so a cut connection or a bad file never leaves a broken
 * database behind. Stalls (no bytes for `idleTimeoutMs`) and server errors are retried.
 */
export async function downloadGameDb(opts: {
  dest: string;
  manifest: DataManifest;
  fetch?: FetchLike;
  baseUrl?: string;
  progress?: (fraction: number) => void;
  attempts?: number;
  idleTimeoutMs?: number;
}): Promise<void> {
  const fetchFn = opts.fetch ?? (fetch as FetchLike);
  const want = opts.manifest;
  const url = `${opts.baseUrl ?? releaseBaseUrl()}/game.db`;
  const part = `${opts.dest}.part`;
  // A first-time player has no data folder yet.
  mkdirSync(dirname(opts.dest), { recursive: true });
  await withRetries(opts.attempts ?? 3, async () => {
    rmSync(part, { force: true });
    const ctl = new AbortController();
    let idle: ReturnType<typeof setTimeout> | null = null;
    const poke = () => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => ctl.abort(new Error('the download stalled')), opts.idleTimeoutMs ?? 30_000);
    };
    poke();
    const fd = openSync(part, 'w');
    const hash = createHash('sha256');
    let got = 0;
    try {
      const r = await get(fetchFn, url, ctl.signal);
      if (!r.body) throw new RetryableError('the server sent no file');
      const reader = r.body.getReader();
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (e) {
          throw new RetryableError(`the download was cut off (${(e as Error).message})`);
        }
        if (chunk.done) break;
        poke();
        writeSync(fd, chunk.value);
        hash.update(chunk.value);
        got += chunk.value.length;
        if (got > want.size) throw new Error('The download is bigger than the manifest says. Discarded.');
        opts.progress?.(got / want.size);
      }
    } catch (e) {
      closeSync(fd);
      rmSync(part, { force: true });
      throw e;
    } finally {
      if (idle) clearTimeout(idle);
    }
    closeSync(fd);
    if (got !== want.size) {
      rmSync(part, { force: true });
      throw new RetryableError(`the download ended early (${got} of ${want.size} bytes)`);
    }
    const sha = hash.digest('hex');
    if (sha !== want.sha256) {
      rmSync(part, { force: true });
      throw new Error('The downloaded file does not match the published checksum. It was discarded.');
    }
  });
  rmSync(opts.dest, { force: true });
  renameSync(part, opts.dest);
  writeFileSync(sidecarPath(opts.dest), JSON.stringify(want, null, 2));
}

/** The manifest a downloaded game.db came from, kept next to it (absent for a game.db built here). */
export const sidecarPath = (dbPath: string) => `${dbPath}.manifest.json`;

export function readSidecar(dbPath: string): DataManifest | null {
  const p = sidecarPath(dbPath);
  if (!existsSync(p)) return null;
  try {
    return parseManifest(JSON.parse(readFileSync(p, 'utf8')));
  } catch {
    return null;
  }
}

/** What's on this computer now, as far as updating goes. */
export interface LocalData {
  /** 'real' or 'synthetic' from game.db's meta; null when there is no game.db. */
  kind: string | null;
  lastDate: string | null;
  /** Built from schwab.db (the same kind of data the Options DB publishes). */
  fromSchwab: boolean;
  /** The release it was downloaded from, when it was downloaded. */
  downloaded: DataManifest | null;
}

export type UpdatePlan =
  { action: 'install' | 'update'; reason: string } | { action: 'keep'; reason: string };

/**
 * Whether the published data should replace what's here. Never goes backwards: data built on
 * this computer that runs later than the release stays. A DoltHub build is kept too (it has real
 * earnings and dividends that the Schwab-built release doesn't), unless the player asks.
 */
export function planUpdate(
  local: LocalData,
  remote: DataManifest,
  opts: { manual?: boolean } = {},
): UpdatePlan {
  const last = remote.dateRange.last;
  if (!local.kind || local.kind === 'synthetic' || !local.lastDate)
    return { action: 'install', reason: `Real market data through ${last} is available.` };
  if (local.lastDate > last)
    return {
      action: 'keep',
      reason: `Your data runs through ${local.lastDate}, later than the published ${last}.`,
    };
  if (!local.fromSchwab && !local.downloaded && !opts.manual)
    return {
      action: 'keep',
      reason: 'Your data is the DoltHub build (it has earnings); DOWNLOAD LATEST DATA replaces it.',
    };
  if (local.lastDate < last)
    return { action: 'update', reason: `New days: through ${last} (yours ends ${local.lastDate}).` };
  // Same last day: a re-publish of it (real closing chains added, a fix) replaces a downloaded copy.
  if (local.downloaded && local.downloaded.sha256 !== remote.sha256)
    return { action: 'update', reason: `An updated release of the data through ${last}.` };
  return { action: 'keep', reason: `Up to date: data through ${last}.` };
}

/**
 * Puts a verified download in place of game.db. The caller closes game.db first (Windows can't
 * replace an open file). Old -wal/-shm files go too, or SQLite would replay them onto the new file.
 */
export function installDownloaded(staged: string, target: string): void {
  for (const s of ['', '-wal', '-shm']) rmSync(target + s, { force: true });
  renameSync(staged, target);
  rmSync(sidecarPath(target), { force: true });
  if (existsSync(sidecarPath(staged))) renameSync(sidecarPath(staged), sidecarPath(target));
}

/** A staged download (game.db.next) that is still intact, with its manifest. */
export function stagedDownload(stagedPath: string): DataManifest | null {
  const m = readSidecar(stagedPath);
  if (!m || !existsSync(stagedPath)) return null;
  return statSync(stagedPath).size === m.size ? m : null;
}

/** Forget a staged download (it's been applied elsewhere or is out of date). */
export function discardStaged(stagedPath: string): void {
  rmSync(stagedPath, { force: true });
  rmSync(sidecarPath(stagedPath), { force: true });
  rmSync(`${stagedPath}.part`, { force: true });
}
