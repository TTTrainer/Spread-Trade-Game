import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchGame, shot } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const stg = (page: Page, f: () => unknown) => page.evaluate(f);

const setSpeed = (page: Page, sec: number, pace: string) =>
  page.evaluate(
    ([sec, pace]) => {
      const stg = (window as Any).__stg;
      stg.app.getState().updateSettings((x: Any) => ({ ...x, game: { ...x.game, ffSecondsPerDay: sec } }));
      stg.trading.getState().setPace(pace);
    },
    [sec, pace] as const,
  );

/**
 * Playtest 5 crash: a coworker line, the round target and several trades closing all landed at
 * once. This plays a run hard (four trades a round, every decision answered with the plan) and
 * fails on any page error or logged error. It also shows the take-profit moment.
 */
test('many trades closing at once with lines and the target: no errors, and profits feel taken', async () => {
  test.setTimeout(240_000);
  const { app, page, userData } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message} ${e.stack ?? ''}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console ${m.text()}`);
  });
  await page.waitForFunction(() => (window as Any).__stg !== undefined);
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await stg(page, () =>
    (window as Any).__stg.app.getState().updateSettings((x: Any) => ({
      ...x,
      game: { ...x.game, ffSecondsPerDay: 0.06, pauseOnTest: false, dayPace: '4' },
    })),
  );
  await page.evaluate(async () => {
    await (window as Any).__stg.run.getState().newRun({ deskId: 'verticals', seed: 'collide-a' });
  });
  await stg(page, () => (window as Any).__stg.app.getState().go('run'));
  const t0 = Date.now();
  let traded = -1;
  let tookProfit = false;
  let sawMini = false;
  let rounds = 0;
  while (Date.now() - t0 < 200_000 && rounds < 4) {
    const phase = (await stg(
      page,
      () => (window as Any).__stg.run.getState().engine?.state.phase ?? 'none',
    )) as string;
    if (phase === 'victory' || phase === 'defeat') break;
    if (phase === 'tally') {
      const skip = page.getByTestId('tally-skip');
      if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => undefined);
      const cont = page.getByTestId('tally-continue');
      if (await cont.isVisible().catch(() => false)) {
        await cont.click().catch(() => undefined);
        rounds++;
      }
    } else if (phase === 'shop') {
      await page
        .getByTestId('leave-shop')
        .click()
        .catch(() => undefined);
    } else if (phase === 'review_intro') {
      await page
        .getByTestId('review-accept')
        .click()
        .catch(() => undefined);
    } else if (phase === 'round') {
      const idx = (await stg(page, () => {
        const st = (window as Any).__stg.run.getState().engine.state;
        return st.quarter * 10 + st.roundIndex;
      })) as number;
      if (idx !== traded) {
        traded = idx;
        await expect(page.getByTestId('trading-screen')).toBeVisible({ timeout: 30_000 });
        const play = page.getByTestId('board-play');
        if (await play.isVisible().catch(() => false)) await play.click();
        for (let i = 1; i <= 4; i++) {
          await page.keyboard.press(`Alt+${i}`);
          await page.waitForTimeout(120);
          await page.keyboard.press('4');
          await page.waitForTimeout(120);
          await page.keyboard.press('Alt+S');
          await page.waitForTimeout(200);
        }
        if (!sawMini) {
          sawMini = true;
          // The miniplayer: the other cards' open trades as small live charts. Watch a card with no
          // trade, at a slow clock, so the shot lands mid-day.
          await setSpeed(page, 6, '1');
          await page.keyboard.press('Alt+4');
          await page.keyboard.press('Space');
          await expect(page.getByTestId('mini-player')).toBeVisible({ timeout: 10_000 });
          await page.waitForTimeout(1500);
          await shot(page, '16-miniplayer-1920');
          await shot(page, '16-miniplayer-1366', { width: 1366, height: 768 });
          await page.setViewportSize({ width: 1920, height: 1080 });
          await setSpeed(page, 0.06, '4');
        } else await page.keyboard.press('Space');
      }
      const ff = (await stg(page, () => (window as Any).__stg.trading.getState().ff)) as string;
      if (ff === 'paused' || ff === 'idle') await page.keyboard.press('Space');
      if (
        await page
          .getByTestId('decision-modal')
          .isVisible()
          .catch(() => false)
      ) {
        // A hit target is the take-profit dialog: the money first, then TAKE PROFIT or LET IT RIDE.
        if (
          !tookProfit &&
          (await page
            .getByTestId('tp-amount')
            .isVisible()
            .catch(() => false))
        ) {
          await expect(page.getByTestId('pl-range').first()).toBeVisible();
          await page.waitForTimeout(500);
          await shot(page, '16-take-profit-1920');
          await shot(page, '16-take-profit-1366', { width: 1366, height: 768 });
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.keyboard.press('Enter');
          // Cashing out plays the payout: the P/L as chips, the mult, the cartridges, the total.
          await expect(page.getByTestId('payout')).toBeVisible({ timeout: 10_000 });
          await expect(page.getByTestId('payout')).toContainText('CASH OUT');
          await page.waitForTimeout(900);
          await shot(page, '16-profit-taken-1920');
          tookProfit = true;
        } else await page.keyboard.press('Enter');
      }
      const end = page.getByTestId('end-round');
      if (await end.isVisible().catch(() => false)) await end.click().catch(() => undefined);
    }
    await page.waitForTimeout(120);
  }
  const logPath = join(userData, 'logs', 'game.log');
  const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  const bad = log.split('\n').filter((l) => /\[error\]|stuck|reload|gone/.test(l));
  expect(errors, errors.join('\n')).toEqual([]);
  expect(bad, bad.join('\n')).toEqual([]);
  expect(rounds).toBeGreaterThanOrEqual(2);
  expect(tookProfit).toBe(true);
  expect(sawMini).toBe(true);
  await app.close();
});
