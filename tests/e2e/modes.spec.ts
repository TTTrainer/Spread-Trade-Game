import { expect, test, type Page } from '@playwright/test';
import { launchGame, shot } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const stg = (page: Page) => page.waitForFunction(() => (window as Any).__stg !== undefined);

async function fastClock(page: Page): Promise<void> {
  await stg(page);
  await page.evaluate(() => {
    (window as Any).__stg.app.getState().updateSettings((x: Any) => ({
      ...x,
      game: { ...x.game, ffSecondsPerDay: 0.06 },
    }));
  });
}

async function giveProfile(page: Page, patch: Record<string, unknown>): Promise<void> {
  await stg(page);
  await page.evaluate(async (p) => {
    const store = (window as Any).__stg.profile.getState();
    await store.load();
    await store.set((x: Any) => ({ ...x, ...p }));
  }, patch);
}

/** Call up with 60%, keep the builder's structure, market order, and send it (credit or debit). */
async function placeDefault(page: Page): Promise<void> {
  await page.keyboard.press('4');
  await page.keyboard.press('Shift+2');
  await page.getByTestId('order-market').click();
  await page.waitForTimeout(300);
  const credit = await page.evaluate(() => ((window as Any).__stg.trading.getState().plan()?.mid ?? 0) < 0);
  await page.keyboard.press(credit ? 'Alt+S' : 'Alt+B');
  // Orders send straight away by default (no confirm box).
  await expect(page.getByTestId('toasts')).toContainText('Filled');
}

/** Run the clock, holding (or closing) at decision points, until a condition holds. */
async function runClock(page: Page, done: () => Promise<boolean>, maxLoops = 600): Promise<void> {
  await page.keyboard.press('Space');
  for (let i = 0; i < maxLoops; i++) {
    if (await done()) return;
    const modal = page.getByTestId('decision-modal');
    if (await modal.isVisible()) {
      const hold = page.getByTestId('dp-hold');
      if (await hold.count()) await hold.click();
      else await page.getByTestId('dp-sell_shares').or(page.getByTestId('dp-close')).first().click();
    }
    await page.waitForTimeout(100);
  }
  throw new Error('the clock never reached the expected state');
}

test('daily: seeded quarter with Bradley’s ghost, save and continue', async () => {
  const { app, page } = await launchGame();
  await page.getByTestId('menu-daily').click();
  await expect(page.getByTestId('daily-screen')).toBeVisible();
  await expect(page.getByTestId('daily-streak')).toContainText('Streak');
  await shot(page, '09-daily-1920');
  await page.getByTestId('daily-start').click();
  await expect(page.getByTestId('round-meter')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('ghost-chip')).toContainText('BRADLEY');
  await shot(page, '09-daily-run-1920');
  await page.getByTestId('run-menu').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByTestId('menu-daily').click();
  await expect(page.getByTestId('ghost-score')).toBeVisible();
  await page.getByTestId('daily-continue').click();
  await expect(page.getByTestId('round-meter')).toBeVisible();
  await app.close();
});

test('contracts: take a client request, trade it out, get paid', async () => {
  const { app, page } = await launchGame();
  await fastClock(page);
  await page.getByTestId('menu-contracts').click();
  await expect(page.getByTestId('contracts-screen')).toBeVisible();
  await expect(page.locator('.contract')).toHaveCount(5, { timeout: 30_000 });
  await shot(page, '09-contracts-1920');
  await page.locator('[data-testid^="accept-"]').first().click();
  await expect(page.getByTestId('contract-checklist')).toBeVisible({ timeout: 30_000 });
  await placeDefault(page);
  await shot(page, '09-contract-trade-1920');
  await runClock(page, () => page.getByTestId('contract-result').isVisible());
  await expect(page.getByTestId('contract-result')).toContainText('Bonus');
  await shot(page, '09-contract-result-1920');
  await page.getByTestId('contract-result').getByRole('button').click();
  await expect(page.getByTestId('contracts-screen')).toBeVisible();
  await expect(page.locator('.contract.done')).toHaveCount(1);
  await app.close();
});

test('live: paper spread at the latest close, sync, positions catch up', async () => {
  const { app, page } = await launchGame();
  await fastClock(page);
  await page.getByTestId('menu-live').click();
  await expect(page.getByTestId('live-edge')).toContainText('AS OF', { timeout: 30_000 });
  const edge1 = await page.getByTestId('live-edge').innerText();
  await page.locator('[data-testid^="live-sym-"]').first().click();
  await expect(page.getByTestId('topbar')).toContainText('LIVE');
  await page.getByTestId('structure-bull_put').click();
  // A narrow spread keeps the max loss inside the 10% risk cap on any SIM price.
  await page.evaluate(() => (window as Any).__stg.trading.getState().setBuilder({ width: 1 }));
  await placeDefault(page);
  await shot(page, '09-live-trade-1920');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('toasts')).toContainText('Sync', { timeout: 15_000 });
  await page.getByTestId('live-back').click();
  await expect(page.getByTestId('live-positions')).toBeVisible();
  await shot(page, '09-live-1920');
  await page.getByTestId('live-sync').click();
  await expect(page.getByTestId('live-edge')).not.toHaveText(edge1, { timeout: 30_000 });
  await expect(page.getByTestId('live-positions')).toBeVisible();
  // The desk opens where we left off and the clock runs to the new close.
  await page.getByTestId('live-open-desk').click();
  const day0 = await page.evaluate(() => (window as Any).__stg.trading.getState().session.dayIndex);
  await runClock(page, async () => {
    const s = await page.evaluate(() => {
      const t = (window as Any).__stg.trading.getState();
      return { ff: t.ff, day: t.session?.dayIndex ?? 0 };
    });
    return s.day > day0 && s.ff !== 'running' && s.ff !== 'decision';
  });
  await app.close();
});

test('the pad and the career office: Bonus buys art, a new home, a desk; tiers and Heat', async () => {
  const { app, page } = await launchGame();
  await giveProfile(page, { bonus: 1000, xp: 900 });
  await page.getByTestId('menu-pad').click();
  await expect(page.getByTestId('pad-screen')).toBeVisible();
  await expect(page.getByTestId('pad-bonus')).toContainText('1000');
  await page.getByTestId('pad-buy-loft').click();
  await page.getByTestId('pad-tab-art').click();
  await page.getByTestId('pad-buy-art_candle5').click();
  await page.getByTestId('pad-buy-art_theta').click();
  await page.getByTestId('pad-tab-vehicles').click();
  await page.getByTestId('pad-buy-v_hoverbike').click();
  await page.getByTestId('pad-tab-setup').click();
  await page.getByTestId('pad-setup-monitors').click();
  await page.getByTestId('pad-setup-monitors').click();
  await expect(page.getByTestId('pad-bonus')).not.toContainText('1000');
  await shot(page, '09-pad-1920');
  await shot(page, '09-pad-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: 'BACK' }).click();
  await page.getByTestId('menu-career').click();
  await expect(page.getByTestId('career-rank')).toContainText('TRADER');
  await expect(page.getByTestId('desk-income')).toBeDisabled();
  await page.getByTestId('unlock-income').click();
  await expect(page.getByTestId('desk-income')).toBeEnabled();
  await expect(page.getByTestId('tier-0')).toBeEnabled();
  await expect(page.getByTestId('tier-1')).toBeDisabled();
  await page.getByTestId('rule-fees').check();
  await page.getByTestId('rule-guidance').check();
  await expect(page.getByTestId('heat-total')).toContainText('HEAT 3');
  await shot(page, '09-career-1920');
  await shot(page, '09-career-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  // The run starts with the rules on.
  await page.getByTestId('desk-income').click();
  await page.getByTestId('start-run').click();
  await expect(page.getByTestId('round-meter')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('topbar').or(page.locator('.rtb-round'))).toContainText('HEAT 3');
  await app.close();
});

test('tutorial: Ines coaches the first round', async () => {
  const { app, page } = await launchGame();
  await page.getByTestId('menu-career').click();
  await expect(page.getByTestId('tutorial-banner')).toBeVisible();
  await page.getByTestId('start-tutorial').click();
  await expect(page.getByTestId('tutorial-coach')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('tutorial-coach')).toHaveAttribute('data-step', 'call');
  await page.keyboard.press('4');
  await expect(page.getByTestId('tutorial-coach')).toHaveAttribute('data-step', 'build');
  await shot(page, '09-tutorial-1920');
  await app.close();
});

test('endless: a Career victory continues into Year 2', async () => {
  const { app, page } = await launchGame();
  await stg(page);
  await page.evaluate(async () => {
    const run = (window as Any).__stg.run.getState();
    await run.newRun({ deskId: 'verticals', seed: 'endless-e2e' });
  });
  await page.evaluate(async () => {
    const run = (window as Any).__stg.run.getState();
    // Stand in for a won year: the last round done, the result banked as a victory.
    const st = run.engine.state;
    st.quarter = 4;
    st.roundIndex = 2;
    st.phase = 'victory';
    st.result = {
      outcome: 'victory',
      reason: 'You beat the year and beat SPY.',
      calGrade: 'B',
      meanBrier: 0.7,
      xp: 200,
      bonus: 40,
      alphaCents: 1000,
      realizedCents: 5000,
      points: 9000,
      roundsCleared: 12,
    };
    run.engine.session = null;
    (window as Any).__stg.app.getState().go('run');
    (window as Any).__stg.run.setState({ version: run.version + 1 });
  });
  await expect(page.getByTestId('end-endless')).toBeVisible();
  await shot(page, '09-victory-endless-1920');
  await page.getByTestId('end-endless').click();
  await expect(page.getByTestId('shop-screen')).toBeVisible();
  await page.getByTestId('leave-shop').click();
  await expect(page.locator('.rtb-round')).toContainText('Y2 Q1', { timeout: 60_000 });
  await expect(page.locator('.rtb-round')).toContainText('ENDLESS');
  await shot(page, '09-endless-round-1920');
  await app.close();
});
