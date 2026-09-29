/**
 * Finding (or fetching) the Dolt command-line tool, running it, and checking disk space.
 * Jacob does not code, so when Dolt is missing the game can download the official portable
 * build from GitHub into the data folder instead of asking him to install anything.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statfsSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface DoltPaths {
  root: string; // %USERPROFILE%\SpreadTradingGameData
  cloneDir: string; // root\dolt
  binDir: string; // root\dolt-bin
}

export function doltPaths(root: string): DoltPaths {
  return { root, cloneDir: join(root, 'dolt'), binDir: join(root, 'dolt-bin') };
}

const exe = process.platform === 'win32' ? 'dolt.exe' : 'dolt';

function findRecursive(dir: string, name: string, depth = 4): string | null {
  if (depth < 0 || !existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (entry === name) return p;
    if (statSync(p).isDirectory()) {
      const f = findRecursive(p, name, depth - 1);
      if (f) return f;
    }
  }
  return null;
}

/** Returns the dolt executable to use, or null if none is available. */
export function findDolt(paths: DoltPaths): string | null {
  const probe = spawnSync(exe, ['version'], { encoding: 'utf8', shell: false });
  if (probe.status === 0) return exe;
  // Apps opened from the Mac Finder don't see Homebrew's folders on the PATH.
  if (process.platform === 'darwin')
    for (const p of ['/opt/homebrew/bin/dolt', '/usr/local/bin/dolt'])
      if (existsSync(p) && spawnSync(p, ['version'], { encoding: 'utf8' }).status === 0) return p;
  const local = findRecursive(paths.binDir, exe);
  if (local) {
    const p2 = spawnSync(local, ['version'], { encoding: 'utf8' });
    if (p2.status === 0) return local;
  }
  return null;
}

/** Download the portable Dolt build from GitHub releases and unpack it into binDir. */
export async function downloadDolt(paths: DoltPaths, log: (m: string) => void): Promise<string> {
  mkdirSync(paths.binDir, { recursive: true });
  const asset =
    process.platform === 'win32'
      ? 'dolt-windows-amd64.zip'
      : process.platform === 'darwin'
        ? `dolt-darwin-${process.arch === 'arm64' ? 'arm64' : 'amd64'}.tar.gz`
        : 'dolt-linux-amd64.tar.gz';
  const url = `https://github.com/dolthub/dolt/releases/latest/download/${asset}`;
  log(`Downloading Dolt from ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Dolt download failed: HTTP ${res.status}`);
  const file = join(paths.binDir, asset);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  // Windows 10+ ships bsdtar as tar.exe, which unpacks zip files too.
  const args = asset.endsWith('.zip')
    ? ['-xf', file, '-C', paths.binDir]
    : ['-xzf', file, '-C', paths.binDir];
  const r = spawnSync('tar', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`Could not unpack Dolt: ${r.stderr}`);
  const found = findDolt(paths);
  if (!found) throw new Error('Dolt was downloaded but does not run');
  return found;
}

export async function ensureDolt(
  paths: DoltPaths,
  opts: { allowDownload: boolean; log: (m: string) => void },
): Promise<string> {
  const found = findDolt(paths);
  if (found) return found;
  if (!opts.allowDownload) {
    const how = process.platform === 'darwin' ? '"brew install dolt"' : '"winget install DoltHub.Dolt"';
    throw new Error(
      `Dolt is not installed. Install it with ${how} or let the game download it (Settings > Data > Build real data).`,
    );
  }
  return downloadDolt(paths, opts.log);
}

/** Free bytes on the drive holding `dir`. */
export function freeBytes(dir: string): number {
  mkdirSync(dir, { recursive: true });
  const s = statfsSync(dir);
  return Number(s.bavail) * Number(s.bsize);
}

export function runDolt(dolt: string, args: string[], cwd: string, log: (m: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    log(`dolt ${args.join(' ')}`);
    const child = spawn(dolt, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const onData = (d: Buffer) => {
      const line = d.toString().trim();
      if (line) log(line.slice(0, 300));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`dolt ${args[0]} exited with ${code}`)),
    );
  });
}

/** Dolt needs an identity configured before clone/pull. Set a neutral one if missing. */
export function ensureDoltIdentity(dolt: string): void {
  const name = spawnSync(dolt, ['config', '--global', '--get', 'user.name'], { encoding: 'utf8' });
  if (name.status !== 0 || !name.stdout.trim()) {
    spawnSync(dolt, ['config', '--global', '--add', 'user.name', 'Spread Trading Game'], {
      encoding: 'utf8',
    });
    spawnSync(dolt, ['config', '--global', '--add', 'user.email', 'player@spread-trading-game.local'], {
      encoding: 'utf8',
    });
  }
}

export const DOLT_REPOS = {
  options: 'post-no-preference/options',
  stocks: 'post-no-preference/stocks',
  earnings: 'post-no-preference/earnings',
  rates: 'post-no-preference/rates',
} as const;

export type DoltRepoName = keyof typeof DOLT_REPOS;

export async function cloneOrPull(
  dolt: string,
  paths: DoltPaths,
  name: DoltRepoName,
  log: (m: string) => void,
): Promise<void> {
  mkdirSync(paths.cloneDir, { recursive: true });
  const dir = join(paths.cloneDir, name);
  if (existsSync(join(dir, '.dolt'))) {
    await runDolt(dolt, ['pull'], dir, log);
    return;
  }
  // Shallow clones keep only the latest commit: ~16 GB total instead of the full history.
  await runDolt(dolt, ['clone', '--depth', '1', DOLT_REPOS[name], name], paths.cloneDir, log);
}
