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

async function faceBoss(page: Page, id: string, seed: string, desk = 'verticals'): Promise<void> {
  await page.evaluate(
    async ([bossId, s, deskId]) => {
      const w = window as any;
      await w.__stg.run.getState().newRun({ deskId, seed: s, practice: true });
      w.__stg.app.getState().go('run');
      await w.__stg.run.getState().act({ t: 'boardDone' });
      await w.__stg.run.getState().act({ t: 'dev', op: { k: 'boss', id: bossId } });
    },
    [id, seed, desk],
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

test('beating a boss: the trophy on its own screen, then three free spoils, then the desk', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.waitForFunction(() => (window as any).__stg !== undefined);
  // Jacob's crowded desk: the Income desk, a full set of vouchers and cartridges.
  await faceBoss(page, 'underwriter', 'e2e-spoils', 'income');
  await page.evaluate(async () => {
    const run = (window as any).__stg.run.getState();
    for (const id of ['second_monitor', 'terminal_pro', 'margin_upgrade', 'seed_capital'])
      await run.act({ t: 'dev', op: { k: 'voucher', id } });
    for (const id of ['bag_holder', 'two_x_leverage', 'weekend_warrior'])
      await run.act({ t: 'dev', op: { k: 'cartridge', id } });
    // Clear the Review without trading: fill the meter and end the round.
    await run.act({ t: 'dev', op: { k: 'meter', delta: run.engine.state.round.target * 2 } });
    await run.act({ t: 'endRound' });
  });
  await expect(page.getByTestId('tally-screen')).toBeVisible({ timeout: 30_000 });
  // With no trades to count, the tally may already be finished.
  const skip = page.getByTestId('tally-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => undefined);
  await expect(page.getByTestId('tally-continue')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, '17-boss-tally-1920');
  await page.getByTestId('tally-continue').click();
  // Screen one: the trophy, with what it changed in numbers.
  await expect(page.getByTestId('trophy-reveal')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('trophy-name')).toHaveText('Reinsurance Treaty');
  await expect(page.getByTestId('spoils')).toHaveCount(0);
  // The Max-Loss Line moves a point further away (where it starts depends on the tier).
  await expect(page.getByTestId('trophy-deltas')).toContainText(/Max-Loss Line.*\d+%→\d+%/, {
    timeout: 5_000,
  });
  const [lineBefore, lineAfter] = ((await page.getByTestId('trophy-deltas').textContent()) ?? '')
    .match(/(\d+)%→(\d+)%/)!
    .slice(1)
    .map(Number);
  expect(lineAfter - lineBefore).toBe(5);
  await page.waitForTimeout(500);
  await shot(page, '17-boss-trophy-1920');
  await shot(page, '17-boss-trophy-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.keyboard.press('Enter');
  // Screen two: the spoils, three free cartridges.
  await expect(page.getByTestId('trophy-reveal')).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByTestId('spoils')).toBeVisible();
  await page.waitForTimeout(900);
  await shot(page, '17-boss-spoils-1920');
  await shot(page, '17-boss-spoils-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  const before = await page.evaluate(
    () => (window as any).__stg.run.getState().engine.state.cartridges.length,
  );
  await page.getByTestId('spoil-take-1').click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__stg.run.getState().engine.state.cartridges.length))
    .toBe(before + 1);
  await expect(page.getByTestId('spoil-take-0')).toBeDisabled();
  await page.getByTestId('spoils-close').click();
  await expect(page.getByTestId('spoils')).toHaveCount(0);
  await expect(page.getByTestId('trophy-underwriter')).toBeVisible();
  await page.waitForTimeout(600);
  for (const [w, h] of [
    [1920, 1080],
    [1536, 864],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await shot(page, `17-boss-shop-desk-${w}`);
    // Nothing in the taskbar or on the desk sits on top of anything else.
    const overlaps = await page.evaluate(() => {
      const boxes = (sel: string) =>
        [...document.querySelectorAll<HTMLElement>(sel)]
          .filter((el) => el.offsetParent !== null)
          .map((el) => ({ el, r: el.getBoundingClientRect() }));
      const hit = (a: DOMRect, b: DOMRect) =>
        a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      const out: string[] = [];
      for (const sel of ['.os-taskbar > *', '.ld-row > *', '.os-boss > *']) {
        const list = boxes(sel);
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++)
            if (list[i].el.parentElement === list[j].el.parentElement && hit(list[i].r, list[j].r))
              out.push(`${sel}: ${list[i].el.className} / ${list[j].el.className}`);
      }
      return out;
    });
    expect(overlaps, `${w}: ${overlaps.join('; ')}`).toEqual([]);
    // Nothing runs off the right edge, and the desk (with the new trophy) sits above the taskbar.
    const fit = await page.evaluate(() => {
      const shop = document.querySelector('.run-shop') as HTMLElement;
      const trophy = document.querySelector('[data-testid="trophy-underwriter"]')!.getBoundingClientRect();
      const bar = document.querySelector('.os-taskbar')!.getBoundingClientRect();
      return { over: shop.scrollWidth - shop.clientWidth, gap: bar.top - trophy.bottom };
    });
    expect(fit.over, `${w}: shop is ${fit.over}px too wide`).toBeLessThanOrEqual(0);
    expect(fit.gap, `${w}: the trophy sits under the taskbar`).toBeGreaterThan(0);
  }
  expect(errors, errors.join('\n')).toEqual([]);
  await app.close();
});

test('the Early Retiree duel: Chad trades the same cards in his own book, live beside yours', async () => {
  test.setTimeout(180_000);
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
  await faceBoss(page, 'early_retiree', 'e2e-duel');
  await expect(page.getByTestId('duel')).toContainText('when the clock starts');
  await sellBullPut(page);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('duel')).toContainText('CHAD', { timeout: 20_000 });
  await expect
    .poll(
      () => page.evaluate(() => (window as any).__stg.run.getState().engine.duelNow()?.trades.length ?? 0),
      {
        timeout: 20_000,
      },
    )
    .toBeGreaterThan(0);
  // Close the day's recap to see the duel on the chart.
  await expect(page.getByTestId('day-recap')).toBeVisible({ timeout: 20_000 });
  await page.locator('.dr-x').click();
  await expect(page.getByTestId('day-recap')).toHaveCount(0);
  await page.waitForTimeout(800);
  await shot(page, '17-boss-duel-1920');
  await shot(page, '17-boss-duel-1366', { width: 1366, height: 768 });
  expect(errors, errors.join('\n')).toEqual([]);
  await app.close();
});

test('the Collector: a losing trade left at its strike at the close gets an interest notice', async () => {
  test.setTimeout(240_000);
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.waitForFunction(() => (window as any).__stg !== undefined);
  await page.evaluate(() =>
    (window as any).__stg.app.getState().updateSettings((x: any) => ({
      ...x,
      game: { ...x.game, ffSecondsPerDay: 0.2, dayPace: 'step', pauseOnTest: false, payoutSpeed: 'fast' },
    })),
  );
  await faceBoss(page, 'collector', 'e2e-collect');
  await expect(page.getByTestId('boss-live')).toContainText('paid −0');
  // Near-the-money bull puts on three cards, then days until one is charged.
  for (const k of ['Alt+1', 'Alt+2', 'Alt+3']) {
    await page.keyboard.press(k);
    await page.keyboard.press('4');
    await page.evaluate(() => (window as any).__stg.trading.getState().setBuilder({ delta: 0.45 }));
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(300);
  }
  const notice = page.getByTestId('collector-notice');
  for (let i = 0; i < 30; i++) {
    if (await notice.isVisible().catch(() => false)) break;
    const phase = await page.evaluate(() => (window as any).__stg.run.getState().engine.state.phase);
    if (phase !== 'round') break;
    const x = page.locator('.dr-x');
    if (await x.isVisible().catch(() => false)) await x.click();
    const hold = page.getByTestId('dp-hold');
    if (await hold.isVisible().catch(() => false)) {
      await hold.click();
      continue;
    }
    await page.evaluate(() => (window as any).__stg.trading.getState().nextDay());
    await page.waitForTimeout(400);
  }
  await expect(notice).toBeVisible();
  await expect(page.getByTestId('notice-rows')).toContainText('sold put');
  await page.waitForTimeout(700);
  await shot(page, '21-collector-notice-1920');
  await shot(page, '21-collector-notice-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  const owed = await page.evaluate(() => (window as any).__stg.run.getState().engine.state.round.interest);
  expect(owed).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(notice).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByTestId('boss-live')).toContainText(`paid −${owed.toLocaleString()}`);
  expect(errors, errors.join('\n')).toEqual([]);
  await app.close();
});
