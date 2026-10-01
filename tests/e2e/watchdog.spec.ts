import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchGame } from './helpers';

test('a stuck screen is logged and reloaded by the watchdog', async () => {
  test.setTimeout(90_000);
  const { app, page, userData } = await launchGame();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByTestId('menu-career').click();
  await page.waitForTimeout(2500);
  // Freeze the screen's thread for 40 s.
  await page.evaluate(() => {
    setTimeout(() => {
      const t = Date.now();
      while (Date.now() - t < 40_000) {
        /* stuck */
      }
    }, 50);
  });
  const log = () => readFileSync(join(userData, 'logs', 'game.log'), 'utf8');
  await expect.poll(log, { timeout: 30_000 }).toContain('reloading the screen');
  console.log(
    log()
      .split('\n')
      .filter((l) => /stuck|reload/.test(l))
      .join('\n')
      .slice(0, 800),
  );
  // The page Playwright held died with the old screen; ask the window itself.
  const probe = () =>
    app.evaluate(async ({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      if (wc.isCrashed() || wc.isLoading()) return 'loading';
      return (await wc.executeJavaScript(
        `(document.querySelector('[data-testid=title-screen]') ? 'title ' : '') + (document.querySelector('[data-testid=toasts]')?.textContent ?? '')`,
      )) as string;
    });
  await expect.poll(probe, { timeout: 30_000 }).toContain('title');
  await expect.poll(probe, { timeout: 15_000 }).toContain('stopped responding');
  await app.close();
});
