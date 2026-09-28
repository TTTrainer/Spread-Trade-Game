// Runs Playwright's Electron tests. On a Linux box with no display (CI, cloud) it wraps
// the run in xvfb-run; on Windows and desktops it runs directly.
import { spawnSync } from 'node:child_process';

const args = ['playwright', 'test', ...process.argv.slice(2)];
const needsXvfb = process.platform === 'linux' && !process.env.DISPLAY;
const cmd = needsXvfb ? 'xvfb-run' : 'npx';
const cmdArgs = needsXvfb ? ['-a', '--server-args=-screen 0 1920x1080x24', 'npx', ...args] : args;
const res = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(res.status ?? 1);
