// Builds the Mac app for Apple Silicon (arm64) and Intel (x64), then signs and zips each one.
//
// Macs with Apple chips only run apps that carry a code signature. Packaging renames and edits
// the Electron app, which breaks the signature it ships with, so each app is re-signed "ad hoc"
// (a signature with no developer certificate). On a Mac that's `codesign`; on Linux it's
// rcodesign (github.com/indygreg/apple-platform-rs), found on the PATH or through $RCODESIGN.
// Without a paid Apple certificate the app isn't notarized; README_PLAY.md explains the one-time
// "Open Anyway" step; join-mac.sh usually avoids it, because files it makes on the Mac carry no
// download flag.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
};

run('npx', ['electron-builder', '--mac', 'dir', '--arm64', '--x64', '--publish', 'never'], {
  shell: process.platform === 'win32',
});

const signer =
  process.platform === 'darwin'
    ? { cmd: 'codesign', args: (app) => ['--force', '--deep', '--sign', '-', app] }
    : (() => {
        const bin = process.env.RCODESIGN ?? 'rcodesign';
        const ok = spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0;
        return ok ? { cmd: bin, args: (app) => ['sign', app] } : null;
      })();
if (!signer) {
  throw new Error(
    'No code signer: install rcodesign (or set RCODESIGN to its path). Unsigned apps do not open on Apple Silicon.',
  );
}

for (const [dir, arch] of [
  ['mac-arm64', 'arm64'],
  ['mac', 'x64'],
]) {
  const out = join(root, 'release', dir);
  if (!existsSync(out)) throw new Error(`missing ${out}`);
  const app = readdirSync(out).find((f) => f.endsWith('.app'));
  if (!app) throw new Error(`no .app in ${out}`);
  console.log(`Signing ${dir}/${app} (ad hoc)`);
  run(signer.cmd, signer.args(join(out, app)));
  const zip = join(root, 'release', `SpreadTradingGame-mac-${arch}-${version}.zip`);
  rmSync(zip, { force: true });
  // Keep the symbolic links inside the app bundle: the Electron framework needs them.
  if (process.platform === 'darwin') run('ditto', ['-c', '-k', '--keepParent', app, zip], { cwd: out });
  else run('zip', ['-qry', '-X', zip, app], { cwd: out });
  console.log(`Wrote ${zip}`);
}

// For sending over chat: 28 MB parts plus join-mac.sh, which rejoins, checks and installs them.
const parts = join(root, 'release', 'mac-download');
rmSync(parts, { recursive: true, force: true });
mkdirSync(parts, { recursive: true });
const sums = {};
for (const arch of ['arm64', 'x64']) {
  const name = `SpreadTradingGame-mac-${arch}-${version}.zip`;
  const data = readFileSync(join(root, 'release', name));
  sums[arch] = createHash('sha256').update(data).digest('hex');
  const size = 28 * 1024 * 1024;
  for (let i = 0; i * size < data.length; i++)
    writeFileSync(join(parts, `${name}.part${i}`), data.subarray(i * size, (i + 1) * size));
}
const script = readFileSync(join(root, 'tools', 'mac', 'join-mac.sh'), 'utf8')
  .replace('__VERSION__', version)
  .replace('__SUM_ARM64__', sums.arm64)
  .replace('__SUM_X64__', sums.x64);
writeFileSync(join(parts, 'join-mac.sh'), script, { mode: 0o755 });
console.log(`Wrote the download parts and join-mac.sh to ${parts}`);
