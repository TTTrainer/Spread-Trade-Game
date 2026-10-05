import { expect, test } from '@playwright/test';
import { launchGame, shot } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The payout: closing a trade plays its scoring out (chips x mult, the cartridges firing in
 * order, the total), the score waits for it to land, and the clock waits too.
 */
test('closing a trade plays the payout, fires the cartridges, then lands on the score', async () => {
  test.setTimeout(240_000);
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.waitForFunction(() => (window as any).__stg !== undefined);
  await page.evaluate(() =>
    (window as any).__stg.app.getState().updateSettings((x: any) => ({
      ...x,
      game: { ...x.game, ffSecondsPerDay: 0.3, dayPace: 'step', pauseOnTest: false, payoutSpeed: 'normal' },
    })),
  );
  await page.evaluate(async () => {
    const w = window as any;
    const run = w.__stg.run.getState();
    await run.newRun({ deskId: 'verticals', seed: 'e2e-payout', practice: true });
    w.__stg.app.getState().go('run');
    const act = w.__stg.run.getState().act;
    await act({ t: 'boardDone' });
    for (const id of ['bag_holder', 'two_x_leverage', 'weekend_warrior'])
      await act({ t: 'dev', op: { k: 'cartridge', id } });
  });
  await expect(page.getByTestId('cart-bag_holder')).toBeVisible({ timeout: 30_000 });
  // Sell a bull put on the first card.
  await page.keyboard.press('4');
  await page.keyboard.press('Shift+2');
  await page.getByTestId('structure-bull_put').click();
  await page.keyboard.press('Alt+S');
  await expect(page.getByTestId('toasts')).toContainText('Filled');
  // Let days pass until the trade is green (or a week goes by), then cash it out.
  const pos = () =>
    page.evaluate(() => {
      const s = (window as any).__stg.trading.getState().session;
      const p = s?.positions.find((x: any) => x.status === 'open');
      return p ? { id: p.id, pl: p.marks[p.marks.length - 1]?.plCents ?? 0 } : null;
    });
  const playDay = async () => {
    await page.evaluate(() => (window as any).__stg.trading.getState().nextDay());
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = (window as any).__stg.trading.getState();
            return t.ff !== 'running' && !t.dayAnim;
          }),
        { timeout: 20_000 },
      )
      .toBe(true);
    const x = page.locator('.dr-x');
    if (await x.isVisible().catch(() => false)) await x.click();
  };
  for (let i = 0; i < 7; i++) {
    const p = await pos();
    if (!p || (i > 0 && p.pl > 0)) break;
    await playDay();
    // A decision (target hit) may be up: cash out from it.
    const cash = page.getByTestId('dp-close');
    if (await cash.isVisible().catch(() => false)) break;
  }
  const meterBefore = await page.evaluate(
    () => (window as any).__stg.run.getState().engine.state.round.meter,
  );
  const cashOut = page.getByTestId('dp-close');
  if (await cashOut.isVisible().catch(() => false)) await cashOut.click();
  else {
    const p = await pos();
    expect(p).not.toBeNull();
    await page.evaluate((id) => (window as any).__stg.trading.getState().closePosition(id), p!.id);
  }
  await expect(page.getByTestId('payout')).toBeVisible({ timeout: 10_000 });
  // The score waits for the payout: the engine has counted it, the top bar hasn't yet.
  const engineMeter = await page.evaluate(
    () => (window as any).__stg.run.getState().engine.state.round.meter,
  );
  expect(engineMeter).not.toBe(meterBefore);
  await expect(page.getByTestId('round-meter')).toContainText(`${meterBefore.toLocaleString()} /`);
  // How it closed is stamped on the payout (cash out at the target, or closed by hand here).
  await expect(page.getByTestId('po-exit')).toHaveAttribute('data-kind', /target|manual/);
  await page.waitForTimeout(1300);
  await shot(page, '18-payout-steps-1920');
  await expect(page.getByTestId('payout-total')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(250);
  await shot(page, '18-payout-total-1920');
  await expect(page.getByTestId('payout')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('round-meter')).toContainText(`${engineMeter.toLocaleString()} /`);

  // Again at 1366, skipped with Space: it jumps to the total and lands.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.keyboard.press('Alt+2');
  await page.keyboard.press('4');
  await page.keyboard.press('Shift+2');
  await page.getByTestId('structure-bull_put').click();
  await page.keyboard.press('Alt+S');
  await expect(page.getByTestId('toasts')).toContainText('Filled');
  // A same-day close is a day trade (the PDT rule may refuse it): let a day pass first.
  await playDay();
  const p2 = await pos();
  expect(p2).not.toBeNull();
  const cash2 = page.getByTestId('dp-close');
  if (await cash2.isVisible().catch(() => false)) await cash2.click();
  else await page.evaluate((id) => (window as any).__stg.trading.getState().closePosition(id), p2!.id);
  await expect(page.getByTestId('payout')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(900);
  await shot(page, '18-payout-1366');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('payout-total')).toBeVisible({ timeout: 3_000 });
  await expect(page.getByTestId('payout')).toHaveCount(0, { timeout: 5_000 });
  expect(errors, errors.join('\n')).toEqual([]);
  await app.close();
});
