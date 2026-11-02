import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  downloadGameDb,
  fetchManifest,
  installDownloaded,
  parseManifest,
  planUpdate,
  readSidecar,
  sidecarPath,
  stagedDownload,
  type DataManifest,
  type LocalData,
} from '../../data-pipeline/download';

const body = Buffer.from('SQLite format 3\0'.repeat(4096));
const manifest: DataManifest = {
  version: '2026.11.02',
  tag: 'data-2026.11.02',
  buildDate: '2026-11-02T22:00:00.000Z',
  size: body.length,
  sha256: createHash('sha256').update(body).digest('hex'),
  dateRange: { first: '2018-01-02', last: '2026-11-02' },
};

/** A stand-in for GitHub's release-download links, with switches for the ways downloads go wrong. */
let mode: 'ok' | 'flaky' | 'corrupt' | 'short' | 'missing' = 'ok';
let hits = 0;
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    hits++;
    if (mode === 'missing') return void res.writeHead(404).end('Not Found');
    if (req.url?.endsWith('/manifest.json')) return void res.end(JSON.stringify(manifest));
    if (!req.url?.endsWith('/game.db')) return void res.writeHead(404).end();
    if (mode === 'flaky' && hits <= 2) return void res.writeHead(502).end('Bad gateway');
    if (mode === 'corrupt') return void res.end(Buffer.from(body).fill(1, 100, 200));
    if (mode === 'short') return void res.end(body.subarray(0, 1000));
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/releases/latest/download`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  mode = 'ok';
  hits = 0;
});

const tmp = () => mkdtempSync(join(tmpdir(), 'stg-dl-'));

describe('the Options DB release manifest', () => {
  it('is read from the plain download link and checked before anything downloads', async () => {
    expect(await fetchManifest({ baseUrl: base })).toEqual(manifest);
    expect(() => parseManifest({ ...manifest, sha256: 'abc' })).toThrow(/manifest/);
    expect(() => parseManifest({ ...manifest, size: 0 })).toThrow(/manifest/);
    expect(() => parseManifest({ ...manifest, dateRange: { first: '2018-01-02' } })).toThrow(/manifest/);
    mode = 'missing';
    await expect(fetchManifest({ baseUrl: base })).rejects.toThrow(/No published game data/);
  });
});

describe('downloading game.db', () => {
  it('writes a verified copy, with its manifest beside it, into a folder that did not exist', async () => {
    const dest = join(tmp(), 'new', 'data', 'game.db.next');
    const seen: number[] = [];
    await downloadGameDb({ dest, manifest, baseUrl: base, progress: (f) => seen.push(f) });
    expect(readFileSync(dest)).toEqual(body);
    expect(readSidecar(dest)).toEqual(manifest);
    expect(stagedDownload(dest)).toEqual(manifest);
    expect(existsSync(`${dest}.part`)).toBe(false);
    expect(seen.at(-1)).toBe(1);
  });

  it('retries a server error and still verifies', async () => {
    mode = 'flaky';
    const dest = join(tmp(), 'game.db.next');
    await downloadGameDb({ dest, manifest, baseUrl: base });
    expect(readFileSync(dest)).toEqual(body);
  });

  it('discards a file that does not match the checksum, leaving nothing behind', async () => {
    mode = 'corrupt';
    const dest = join(tmp(), 'game.db.next');
    await expect(downloadGameDb({ dest, manifest, baseUrl: base })).rejects.toThrow(/checksum/);
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.part`)).toBe(false);
  });

  it('retries a download that ends early, then gives up without a half file', async () => {
    mode = 'short';
    const dest = join(tmp(), 'game.db.next');
    await expect(downloadGameDb({ dest, manifest, baseUrl: base, attempts: 2 })).rejects.toThrow(
      /ended early/,
    );
    expect(hits).toBe(2);
    expect(existsSync(dest)).toBe(false);
  });

  it('swaps in over the old game.db and drops its -wal/-shm files', async () => {
    const dir = tmp();
    const target = join(dir, 'game.db');
    for (const s of ['', '-wal', '-shm']) writeFileSync(target + s, 'old');
    await downloadGameDb({ dest: `${target}.next`, manifest, baseUrl: base });
    installDownloaded(`${target}.next`, target);
    expect(readFileSync(target)).toEqual(body);
    expect(existsSync(`${target}-wal`) || existsSync(`${target}-shm`)).toBe(false);
    expect(existsSync(`${target}.next`) || existsSync(sidecarPath(`${target}.next`))).toBe(false);
    expect(readSidecar(target)?.version).toBe('2026.11.02');
  });
});

describe('when the published data replaces what is here', () => {
  const local = (o: Partial<LocalData>): LocalData => ({
    kind: 'real',
    lastDate: '2026-10-27',
    fromSchwab: true,
    downloaded: null,
    ...o,
  });

  it('installs when there is no real data, and updates to newer days', () => {
    expect(planUpdate(local({ kind: null, lastDate: null }), manifest).action).toBe('install');
    expect(planUpdate(local({ kind: 'synthetic', lastDate: '2021-06-30' }), manifest).action).toBe('install');
    expect(planUpdate(local({}), manifest).action).toBe('update');
  });

  it('never goes backwards from data built here that runs later', () => {
    const p = planUpdate(local({ lastDate: '2026-11-03' }), manifest, { manual: true });
    expect(p).toMatchObject({ action: 'keep' });
    expect(p.reason).toContain('2026-11-03');
  });

  it('keeps a DoltHub build (it has earnings) unless the player asks', () => {
    expect(planUpdate(local({ fromSchwab: false }), manifest).action).toBe('keep');
    expect(planUpdate(local({ fromSchwab: false }), manifest, { manual: true }).action).toBe('update');
  });

  it('takes a re-publish of the same day over a downloaded copy, and nothing over a current one', () => {
    const same = local({ lastDate: '2026-11-02', downloaded: { ...manifest, sha256: '0'.repeat(64) } });
    expect(planUpdate(same, manifest).action).toBe('update');
    expect(planUpdate({ ...same, downloaded: manifest }, manifest).action).toBe('keep');
    // Built here through the same day: kept (it may hold closes it pulled itself).
    expect(planUpdate(local({ lastDate: '2026-11-02' }), manifest).action).toBe('keep');
  });
});
