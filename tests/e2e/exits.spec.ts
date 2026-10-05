import { expect, test } from '@playwright/test';
import { launchGame, shot } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Playtest (1.6.1): with market orders off (Best Execution Audit), CASH OUT sent a market order the
 * game refused, the target question was used up, and the trade stayed open forever. Exits now go
 * as a limit at the natural price. This replays that run's settings: cash out, close the rest.
 */
test('with market orders off, cashing out and closing the other trade both go through', async () => {
  test.setTimeout(240_000);
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  await page.waitForFunction(() => (window as any).__stg !== undefined);
  await page.evaluate(() =>
    (window as any).__stg.app.getState().updateSettings((x: any) => ({
      ...x,
      game: { ...x.game, ffSecondsPerDay: 0.2, dayPace: 'step', pauseOnTest: false, payoutSpeed: 'fast' },
    })),
  );
  await page.evaluate(async () => {
    const w = window as any;
    await w.__stg.run.getState().newRun({
      deskId: 'verticals',
      seed: 'musr8s9g',
      tier: 8,
      compliance: ['no_market', 'liquidity', 'guidance'],
      practice: true,
    });
    w.__stg.app.getState().go('run');
    await w.__stg.run.getState().act({ t: 'boardDone' });
  });
  await expect(page.getByTestId('trading-screen')).toBeVisible({ timeout: 30_000 });
  // The ticket follows the rules: a limit only, said plainly, with no MARKET to pick.
  await expect(page.getByTestId('market-off')).toBeVisible();
  await expect(page.getByTestId('order-market')).toHaveCount(0);
  await shot(page, '20-market-off-ticket-1920');
  for (const k of ['Alt+1', 'Alt+2']) {
    await page.keyboard.press(k);
    await page.keyboard.press('4');
    await page.keyboard.press('Alt+S');
    await expect(page.getByTestId('toasts')).toContainText('Filled');
  }
  const open = () =>
    page.evaluate(
      () =>
        (window as any).__stg.trading
          .getState()
          .session?.positions.filter((p: any) => p.status === 'open')
          .map((p: any) => p.id) ?? [],
    );
  expect(await open()).toHaveLength(2);
  // Play days until a profit target asks.
  for (let i = 0; i < 30; i++) {
    if (
      await page
        .getByTestId('dp-close')
        .isVisible()
        .catch(() => false)
    )
      break;
    const x = page.locator('.dr-x');
    if (await x.isVisible().catch(() => false)) await x.click();
    const hold = page.getByTestId('dp-hold');
    if (await hold.isVisible().catch(() => false)) {
      await hold.click();
      continue;
    }
    await page.evaluate(() => (window as any).__stg.trading.getState().nextDay());
    await page.waitForTimeout(300);
  }
  await expect(page.getByTestId('dp-close')).toBeVisible();
  await page.getByTestId('dp-close').click();
  await expect.poll(async () => (await open()).length, { timeout: 15_000 }).toBe(1);
  await page.evaluate((id) => (window as any).__stg.trading.getState().closePosition(id), (await open())[0]);
  await expect
    .poll(() => page.evaluate(() => (window as any).__stg.run.getState().engine.state.phase), {
      timeout: 30_000,
    })
    .toBe('tally');
  expect(errors, errors.join('\n')).toEqual([]);
  await app.close();
});
