import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchGame, shot } from './helpers';

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

async function faceBoss(page: Page, id: string, seed: string): Promise<void> {
  await page.evaluate(
    async ([bossId, s]) => {
      const w = window as any;
      await w.__stg.run.getState().newRun({ deskId: 'verticals', seed: s, practice: true });
      w.__stg.app.getState().go('run');
      await w.__stg.run.getState().act({ t: 'boardDone' });
      await w.__stg.run.getState().act({ t: 'dev', op: { k: 'boss', id: bossId } });
    },
    [id, seed],
  );
  await expect(page.getByTestId('review-intro')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('review-accept').click();
  await expect(page.getByTestId('boss-banner')).toBeVisible({ timeout: 60_000 });
}

async function sellBullPut(page: Page): Promise<void> {
  await page.keyboard.press('4');
  await page.keyboard.press('Shift+2');
  await page.getByTestId('structure-bull_put').click();
  await expect(page.getByTestId('score-preview')).toBeVisible();
  await page.keyboard.press('Alt+S');
  await expect(page.getByTestId('toasts')).toContainText('Filled');
}

test('the Controller seals running P/L and equity; the Executor seals expiry until the trade is open', async () => {
  test.setTimeout(240_000);
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.waitForFunction(() => (window as any).__stg !== undefined);
  await page.evaluate(() =>
    (window as any).__stg.app.getState().updateSettings((x: any) => ({
      ...x,
      game: { ...x.game, ffSecondsPerDay: 0.3, dayPace: 'step', pauseOnTest: false },
    })),
  );

  // The Controller: equity and the room above the line are sealed before and after a trade.
  await faceBoss(page, 'controller', 'e2e-controller');
  await expect(page.getByTestId('boss-banner')).toContainText('THE CONTROLLER');
  await expect(page.getByTestId('equity-sealed')).toBeVisible();
  await expect(page.getByTestId('maxloss-gauge')).toHaveCount(0);
  await sellBullPut(page);
  // A day passes: the trade card shows its range, but not where the trade sits on it.
  await page.keyboard.press('Space');
  await expect(page.getByTestId('pos-hud')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('pos-hud').getByTestId('sealed-num').first()).toBeVisible();
  await expect(page.getByTestId('hud-share')).toHaveCount(0);
  await page.waitForTimeout(600);
  await shot(page, '17-boss-controller-1920');
  await shot(page, '17-boss-controller-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  // Let the day finish before leaving.
  await expect
    .poll(() => page.evaluate(() => (window as any).__stg.trading.getState().ff), { timeout: 20_000 })
    .not.toBe('running');

  // The Executor: no expiration line or day count while planning; both appear once it's open.
  await page.evaluate(() => (window as any).__stg.trading.getState().pause?.());
  await faceBoss(page, 'executor', 'e2e-executor');
  await expect(page.getByTestId('boss-banner')).toContainText('THE EXECUTOR');
  await page.keyboard.press('4');
  await page.getByTestId('structure-bull_put').click();
  await expect(page.getByTestId('exp-sealed')).toBeVisible();
  await expect(page.getByTestId('exp-sealed-readout')).toContainText('?');
  await expect(page.getByTestId('exp-line')).toHaveCount(0);
  // Max profit and max loss still show on the plan.
  await expect(page.getByTestId('score-preview')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, '17-boss-executor-plan-1920');
  await shot(page, '17-boss-executor-plan-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.keyboard.press('Shift+2');
  await page.keyboard.press('Alt+S');
  await expect(page.getByTestId('toasts')).toContainText('Filled');
  await expect(page.getByTestId('exp-line')).toBeVisible();
  await expect(page.getByTestId('exp-sealed')).toHaveCount(0);
  expect(errors, errors.join('\n')).toEqual([]);
  await app.close();
});

test('the Allocator shows its second goal; the Rebalancer races SPY on the chart; styles show live', async () => {
  test.setTimeout(240_000);
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.waitForFunction(() => (window as any).__stg !== undefined);
  await page.evaluate(() =>
    (window as any).__stg.app.getState().updateSettings((x: any) => ({
      ...x,
      game: { ...x.game, ffSecondsPerDay: 0.3, dayPace: 'step', pauseOnTest: false },
    })),
  );

  await faceBoss(page, 'allocator', 'e2e-allocator');
  await expect(page.getByTestId('second-goal')).toContainText('0/3');
  await expect(page.getByTestId('boss-live')).toContainText('types 0/3');
  await expect(page.getByTestId('boss-style')).toContainText('STYLE');
  await sellBullPut(page);
  await expect(page.getByTestId('second-goal')).toContainText('1/3');
  await page.waitForTimeout(500);
  await shot(page, '17-boss-allocator-1920');
  await shot(page, '17-boss-allocator-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });

  await faceBoss(page, 'rebalancer', 'e2e-rebalancer');
  await sellBullPut(page);
  await expect(page.getByTestId('spy-race')).toBeVisible();
  await page.keyboard.press('Space');
  await expect
    .poll(
      () => page.evaluate(() => (window as any).__stg.run.getState().engine.state.round.race?.length ?? 0),
      {
        timeout: 20_000,
      },
    )
    .toBeGreaterThan(0);
  await expect(page.getByTestId('spy-race')).toContainText('SPY');
  // Close the day's recap to see the race on the chart.
  const x = page.locator('.dr-x');
  if (await x.isVisible().catch(() => false)) await x.click();
  await page.waitForTimeout(800);
  await shot(page, '17-boss-rebalancer-1920');
  await shot(page, '17-boss-rebalancer-1366', { width: 1366, height: 768 });
  expect(errors, errors.join('\n')).toEqual([]);
  await app.close();
});
