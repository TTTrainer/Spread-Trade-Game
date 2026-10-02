import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchGame } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A whole practice year played by the disciplined bot with the screen attached: every quarter's
 * boss gets its case file and its round. Rerolls swap cards under the chart, bosses seal panels
 * and recolor the board: none of it may cause a single drawing error.
 */
test('a full year of bosses draws without one error', async () => {
  test.setTimeout(300_000);
  const { app, page, userData } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console ${m.text().slice(0, 300)}`);
  });
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.waitForFunction(() => (window as any).__stg !== undefined);
  await page.evaluate(async () => {
    const w = window as any;
    w.__stg.app.getState().updateSettings((x: any) => ({
      ...x,
      game: { ...x.game, ffSecondsPerDay: 0.06, dayPace: '4' },
    }));
    await w.__stg.run.getState().newRun({ deskId: 'verticals', seed: 'e2e-year', practice: true });
    w.__stg.app.getState().go('run');
  });
  const bosses: string[] = [];
  for (let i = 0; i < 400; i++) {
    const ph = await page.evaluate(() => (window as any).__stg.run.getState().engine?.state.phase);
    if (ph === 'victory' || ph === 'defeat') break;
    if (ph === 'review_intro') {
      await expect(page.getByTestId('boss-name')).toBeVisible();
      bosses.push((await page.getByTestId('boss-name').textContent()) ?? '');
      await page.getByTestId('review-accept').click();
      await expect(page.getByTestId('boss-banner')).toBeVisible({ timeout: 60_000 });
      continue;
    }
    await page.evaluate(() => (window as any).__stg.botPlay('disciplined', 1));
  }
  const log = join(userData, 'logs', 'game.log');
  const bad = (existsSync(log) ? readFileSync(log, 'utf8') : '')
    .split('\n')
    .filter((l) => /\[error\]/.test(l));
  expect(errors, errors.join('\n')).toEqual([]);
  expect(bad, bad.join('\n')).toEqual([]);
  // Four quarters, four bosses, the last one the Rebalancer, no repeats.
  expect(bosses.length).toBe(4);
  expect(bosses[3]).toBe('THE REBALANCER');
  expect(new Set(bosses).size).toBe(4);
  await app.close();
});
