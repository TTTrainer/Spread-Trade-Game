import { expect, test, type Page } from '@playwright/test';
import { launchGame, shot } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const coach = (page: Page) => page.getByTestId('tutorial-coach');
const step = (page: Page, id: string) =>
  expect(coach(page)).toHaveAttribute('data-step', id, { timeout: 30_000 });
const gotIt = async (page: Page) => {
  await page.getByTestId('tut-next').click();
};
const hidden = (page: Page, testId: string) =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    return !!el && getComputedStyle(el).visibility === 'hidden';
  }, testId);

test('tutorial: one thing at a time, from the goal to the first trade to the shop', async () => {
  const { app, page } = await launchGame();
  await page.getByTestId('menu-career').click();
  await expect(page.getByTestId('tutorial-banner')).toBeVisible();
  await page.getByTestId('start-tutorial').click();

  // Part 1: an almost empty desk and the goal.
  await step(page, 'welcome');
  expect(await hidden(page, 'lineup')).toBe(true);
  expect(await hidden(page, 'tickets')).toBe(true);
  // Kessler's pop-up stays quiet: Ines is the only voice.
  await expect(page.getByTestId('dialogue')).toHaveCount(0);
  await shot(page, 'tut-01-welcome-1920');
  // The clock is locked during the lessons before the first trade.
  await page.keyboard.press('Space');
  await expect(page.getByTestId('toasts')).toContainText('One thing at a time');
  await page.keyboard.press('Enter');
  await step(page, 'goal');
  await shot(page, 'tut-02-goal-1920');
  await gotIt(page);
  await step(page, 'maxloss');
  await gotIt(page);

  // Part 2: the first trade, step by step.
  await step(page, 'lineup');
  expect(await hidden(page, 'lineup')).toBe(false);
  await gotIt(page);
  await step(page, 'chart');
  await shot(page, 'tut-03-chart-1920');
  await gotIt(page);
  await step(page, 'spread');
  await shot(page, 'tut-03b-spread-1920');
  await gotIt(page);
  await step(page, 'view');
  await shot(page, 'tut-04-view-1920');
  await page.getByTestId('tut-up').click();
  await step(page, 'line');
  await expect(coach(page)).toContainText('stays above this line');
  await shot(page, 'tut-05-line-1920');
  await gotIt(page);
  await step(page, 'pay');
  await shot(page, 'tut-06-pay-1920');
  await shot(page, 'tut-06-pay-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await gotIt(page);
  await step(page, 'strike');
  await expect(page.locator('.tut-drag .td-hand')).toBeVisible();
  await shot(page, 'tut-07-strike-1920');
  await shot(page, 'tut-07-strike-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.keyboard.press('Enter');
  await step(page, 'safe');
  await shot(page, 'tut-07b-safe-1920');
  await gotIt(page);
  await step(page, 'place');
  await page.getByTestId('sell-button').click();
  await step(page, 'placed');
  await shot(page, 'tut-08-placed-1920');
  await gotIt(page);

  // Part 3: time.
  await step(page, 'clock');
  await shot(page, 'tut-09-clock-1920');
  await page.keyboard.press('Space');
  await step(page, 'm-recap');
  await shot(page, 'tut-10-recap-1920');
  await gotIt(page);
  await step(page, 'exitplan');
  await gotIt(page);
  await step(page, 'keep');
  await shot(page, 'tut-11-keep-1920');

  // Jump to the end of the round: close the trade and end it.
  await page.evaluate(async () => {
    const t = (window as Any).__stg.trading.getState();
    t.dismissRecap();
    for (const p of t.session.openPositions()) await t.closePosition(p.id);
  });
  await page.evaluate(async () => {
    const run = (window as Any).__stg.run.getState();
    await run.act({ t: 'endRound' });
  });
  await expect(page.getByTestId('tally-screen')).toBeVisible({ timeout: 30_000 });
  await step(page, 'tally');
  await shot(page, 'tut-12-tally-1920');
  await gotIt(page);
  const skip = page.getByTestId('tally-skip');
  if (await skip.isVisible()) await skip.click();
  await page.getByTestId('tally-continue').click();

  // Part 5: the shop, one window at a time.
  await expect(page.getByTestId('shop-screen')).toBeVisible({ timeout: 30_000 });
  await step(page, 'shopcash');
  expect(await hidden(page, 'win-analysts')).toBe(true);
  expect(await hidden(page, 'win-carts')).toBe(true);
  await shot(page, 'tut-13-shop-cash-1920');
  await gotIt(page);
  await step(page, 'carts');
  expect(await hidden(page, 'win-carts')).toBe(false);
  await shot(page, 'tut-14-shop-carts-1920');
  await shot(page, 'tut-14-shop-carts-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await gotIt(page);
  await step(page, 'loadout');
  await gotIt(page);
  await step(page, 'families');
  await shot(page, 'tut-15-shop-families-1920');
  await gotIt(page);
  await step(page, 'buy');
  await page.getByTestId('leave-shop').click();

  // The losing trade raised stress: its gauge gets a one-time lesson as Month 2 opens.
  await step(page, 'm-stress');
  await shot(page, 'tut-16-stress-1920');
  await gotIt(page);

  // Part 6: Month 2 adds the remaining tools.
  await step(page, 'tickets');
  await shot(page, 'tut-17-tickets-1920');
  await gotIt(page);
  await step(page, 'expires');
  await shot(page, 'tut-18-expires-1920');
  await gotIt(page);
  await step(page, 'size');
  await gotIt(page);
  await step(page, 'brief');
  await shot(page, 'tut-19-brief-1920');
  await gotIt(page);
  await step(page, 'payoff');
  await gotIt(page);
  await step(page, 'controls');
  await gotIt(page);
  await step(page, 'yourturn');
  await shot(page, 'tut-20-yourturn-1920');

  // Skipping the lessons turns the whole desk on.
  await page.getByTestId('tut-skip').click();
  await expect(coach(page)).toHaveCount(0);
  expect(await hidden(page, 'cartridge-rail')).toBe(false);
  expect(await hidden(page, 'structure-cards')).toBe(false);
  await app.close();
});

test('tutorial: lessons resume where they were', async () => {
  const { app, page, userData } = await launchGame();
  await page.getByTestId('menu-career').click();
  await page.getByTestId('start-tutorial').click();
  await step(page, 'welcome');
  await page.keyboard.press('Enter');
  await step(page, 'goal');
  await gotIt(page);
  await step(page, 'maxloss');
  await page.waitForTimeout(500);
  await app.close();
  const again = await launchGame({ userData });
  await again.page.getByTestId('menu-career').click();
  await again.page.getByTestId('continue-tutorial').click();
  await step(again.page, 'maxloss');
  await again.app.close();
});
