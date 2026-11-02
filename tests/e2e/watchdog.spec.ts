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

test('a drawing error restarts the screen straight back into the run', async () => {
  test.setTimeout(90_000);
  const { app, page, userData } = await launchGame();
  // On a failure, show what the game logged (a real drawing error before ours would be here).
  test.info().attachments.push({
    name: 'game.log',
    path: join(userData, 'logs', 'game.log'),
    contentType: 'text/plain',
  });
  page.on('crash', () => console.log('renderer crashed; log so far:\n' + safeLog(userData)));
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.waitForFunction(() => (window as { __stg?: unknown }).__stg !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as {
      __stg: {
        run: { getState(): { newRun(o: object): Promise<boolean> } };
        app: { getState(): { go(s: string): void } };
      };
    };
    await w.__stg.run.getState().newRun({ deskId: 'verticals', seed: 'restart-e2e' });
    w.__stg.app.getState().go('run');
  });
  await expect(page.getByTestId('trading-screen')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  // Trigger the error from the main process: the screen restarts right after, and a test call
  // into the page that is still open at that moment would be reported as a crash of the test.
  await app.evaluate(({ BrowserWindow }) => {
    void BrowserWindow.getAllWindows()[0]
      .webContents.executeJavaScript(
        // React retries a failed draw once on its own; fail a few times so the boundary sees it.
        `window.__stgCrash = 3; window.__stg.run.setState({ version: window.__stg.run.getState().version + 1 }); 1`,
      )
      .catch(() => undefined);
  });
  const log = () => readFileSync(join(userData, 'logs', 'game.log'), 'utf8');
  await expect.poll(log, { timeout: 20_000 }).toContain('drawing error');
  const probe = () =>
    app.evaluate(async ({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      if (wc.isCrashed() || wc.isLoading()) return 'loading';
      // A call into a screen that is being restarted never answers: give up after 3 s and ask again.
      return (await Promise.race([
        wc.executeJavaScript(
          `(document.querySelector('[data-testid=trading-screen]') ? 'run ' : '') + (document.querySelector('[data-testid=toasts]')?.textContent ?? '')`,
        ),
        new Promise((r) => setTimeout(() => r('waiting'), 3000)),
      ])) as string;
    });
  await expect.poll(probe, { timeout: 40_000 }).toContain('run');
  await expect.poll(probe, { timeout: 15_000 }).toContain('back in your run');
  await app.close();
});

function safeLog(userData: string): string {
  try {
    return readFileSync(join(userData, 'logs', 'game.log'), 'utf8')
      .split('\n')
      .filter((l) => /error|warn/.test(l))
      .slice(-12)
      .join('\n');
  } catch {
    return '(no log)';
  }
}
