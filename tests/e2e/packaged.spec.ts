import { _electron as electron, expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = join(process.cwd(), 'release', 'linux-unpacked');
const pkgVersion = (
  JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }
).version;

/** Runs only after a packaged build (npx electron-builder --linux dir): the same app.asar as the Windows exe. */
test('packaged app boots, shows its version, and deals a Career round', async () => {
  test.skip(!existsSync(dir), 'no packaged build in release/linux-unpacked');
  const exe = join(
    process.cwd(),
    'release',
    'linux-unpacked',
    readdirSync('release/linux-unpacked').find((f) => /^spread/i.test(f))!,
  );
  const userData = mkdtempSync(join(tmpdir(), 'stg-pkg-'));
  const app = await electron.launch({
    executablePath: exe,
    args: ['--no-sandbox'],
    env: { ...process.env, STG_USER_DATA: userData } as Record<string, string>,
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByTestId('title-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('data-status')).toContainText('SIM');
  await expect(page.locator('.title-foot')).toContainText(`v${pkgVersion}`);
  await page.getByTestId('menu-career').click();
  await page.getByTestId('start-run').click();
  await expect(page.getByTestId('round-meter')).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: join(process.cwd(), 'test-results', 'screens', '11-packaged-round.png') });
  console.log('page errors:', errors.length ? errors : 'none');
  expect(errors).toEqual([]);
  await app.close();
});
