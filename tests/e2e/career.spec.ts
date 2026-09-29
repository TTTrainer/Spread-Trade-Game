import { expect, test, type Page } from '@playwright/test';
import { launchGame, shot } from './helpers';
import { BALANCE } from '../../src/content/balance';

const Q1 = BALANCE.targets.q1;

type RunState = {
  phase: string;
  quarter: number;
  roundIndex: number;
  cash: number;
  round: {
    meter: number;
    target: number;
    ticketsUsed: number;
    cards: { cardId: string; windowId: number }[];
  };
  history: unknown[];
  result: { outcome: string } | null;
};
type Stg = {
  app: { getState: () => { updateSettings: (f: (s: unknown) => unknown) => void } };
  trading: {
    getState: () => {
      ff: string;
      session: {
        positions: { id: string; status: string; realizedCents: number | null }[];
        dayIndex: number;
      } | null;
    };
  };
  run: {
    getState: () => {
      engine: { state: RunState; session: { positions: { id: string; status: string }[] } | null } | null;
      newRun: (o: { deskId: string; seed?: string; practice?: boolean }) => Promise<boolean>;
    };
  };
  botPlay: (kind?: string, maxSteps?: number) => Promise<{ outcome: string } | null>;
};

const stg = (page: Page) => page.evaluate(() => (window as unknown as { __stg: Stg }).__stg !== undefined);

async function fastClock(page: Page): Promise<void> {
  await stg(page);
  await page.evaluate(() => {
    const s = (window as unknown as { __stg: Stg }).__stg;
    s.app.getState().updateSettings((x) => ({
      ...(x as object),
      game: { ...(x as { game: object }).game, ffSecondsPerDay: 0.06, pauseOnTest: false, dayPace: '4' },
    }));
  });
}

async function runState(page: Page): Promise<RunState | null> {
  return page.evaluate(() => {
    const e = (window as unknown as { __stg: Stg }).__stg.run.getState().engine;
    return e ? (JSON.parse(JSON.stringify(e.state)) as RunState) : null;
  });
}

/** Place the default ~30-delta bull put on the selected card at market. */
async function sellBullPut(page: Page): Promise<void> {
  await page.keyboard.press('4');
  await page.keyboard.press('Shift+2');
  await expect(page.getByTestId('view-chip')).toContainText('UP');
  await page.getByTestId('structure-bull_put').click();
  await page.getByTestId('order-market').click();
  await expect(page.getByTestId('score-preview')).toBeVisible();
  await page.keyboard.press('Alt+S');
  // Orders send straight away by default (no confirm box).
  await expect(page.getByTestId('toasts')).toContainText('Filled');
}

/** Run the clock until the round is tallied, holding through decision points. */
async function playToTally(page: Page, shotDecision?: string): Promise<void> {
  await page.keyboard.press('Space');
  let shotTaken = false;
  for (let i = 0; i < 600; i++) {
    if (await page.getByTestId('tally-screen').isVisible()) return;
    // Days with news (and recaps) hold the clock; keep it going.
    const ff = await page.evaluate(() => (window as unknown as { __stg: Stg }).__stg.trading.getState().ff);
    if (ff === 'paused') await page.keyboard.press('Space');
    const modal = page.getByTestId('decision-modal');
    if (await modal.isVisible()) {
      if (shotDecision && !shotTaken) {
        await shot(page, shotDecision);
        shotTaken = true;
      }
      const hold = page.getByTestId('dp-hold');
      if (await hold.count()) await hold.click();
      else await page.getByTestId('dp-sell_shares').or(page.getByTestId('dp-close')).first().click();
    }
    await page.waitForTimeout(100);
  }
  throw new Error('round never reached the tally');
}

test('career: start from the menu, save and exit, continue, abandon', async () => {
  const { app, page } = await launchGame();
  await page.getByTestId('menu-career').click();
  await expect(page.getByTestId('career-screen')).toBeVisible();
  await expect(page.getByTestId('desk-verticals')).toBeVisible();
  await expect(page.getByTestId('desk-income')).toBeDisabled();
  await shot(page, '06-career-1920');
  await page.getByTestId('seed-input').fill('menu-seed');
  await page.getByTestId('start-run').click();
  await expect(page.getByTestId('run-topbar')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('round-meter')).toContainText(`0 / ${Q1[0]}`);
  // Director Kessler (or a colleague) greets the new run.
  await expect(page.getByTestId('dialogue')).toBeVisible();
  await expect(page.getByTestId('dialogue').locator('canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, '07-dialogue-1920');
  const before = await runState(page);
  expect(before?.round.cards.length).toBe(BALANCE.run.lineupSize);
  // Rerolling swaps every untraded card.
  await page.getByTestId('reroll').click();
  await expect
    .poll(async () => (await runState(page))?.round.cards.map((c) => c.windowId).join())
    .not.toBe(before?.round.cards.map((c) => c.windowId).join());
  const rerolled = await runState(page);
  await page.getByTestId('run-menu').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByTestId('menu-career').click();
  await expect(page.getByTestId('save-panel')).toContainText('Verticals desk');
  await page.getByTestId('continue-run').click();
  await expect(page.getByTestId('run-topbar')).toBeVisible({ timeout: 30_000 });
  const resumed = await runState(page);
  expect(resumed?.round.cards).toEqual(rerolled?.round.cards);
  await page.getByTestId('run-menu').click();
  await page.getByTestId('menu-career').click();
  await page.getByRole('button', { name: 'ABANDON RUN' }).click();
  await page.getByTestId('abandon-yes').click();
  await expect(page.getByTestId('save-panel')).toHaveCount(0, { timeout: 30_000 });
  await app.close();
});

test('career: a full 12-round Verticals run with tally, shop, Review and resume', async () => {
  test.setTimeout(600_000);
  const first = await launchGame();
  let { app, page } = first;
  const userData = first.userData;
  await fastClock(page);
  await page.getByTestId('menu-career').click();
  await expect(page.getByTestId('career-screen')).toBeVisible();
  // Practice mode keeps the run going through missed rounds so the whole year plays out.
  const ok = await page.evaluate(() =>
    (window as unknown as { __stg: Stg }).__stg.run
      .getState()
      .newRun({ deskId: 'verticals', seed: 'e2e-year', practice: true }),
  );
  expect(ok).toBe(true);
  await page.evaluate(() =>
    (window as unknown as { __stg: { app: { getState: () => { go: (s: string) => void } } } }).__stg.app
      .getState()
      .go('run'),
  );
  await expect(page.getByTestId('run-topbar')).toBeVisible();

  // Round 1 through the real UI.
  await sellBullPut(page);
  await expect(page.getByTestId('tickets')).toBeVisible();
  expect((await runState(page))?.round.ticketsUsed).toBe(1);
  await shot(page, '06-round-1920');
  await shot(page, '06-round-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await playToTally(page, '06-decision-1920');
  await shot(page, '06-tally-anim-1920');
  await page.getByTestId('tally-skip').click();
  await expect(page.getByTestId('tally-continue')).toBeVisible();
  await shot(page, '06-tally-1920');
  await page.getByTestId('tally-continue').click();
  await expect(page.getByTestId('shop-screen')).toBeVisible();
  await shot(page, '06-shop-1920');
  await shot(page, '06-shop-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  const cashBefore = (await runState(page))?.cash ?? 0;
  await page.getByTestId('leave-shop').click();
  await expect(page.getByTestId('run-topbar')).toBeVisible();
  const r2 = await runState(page);
  expect(r2?.roundIndex).toBe(1);
  expect(r2?.round.target).toBe(Q1[1]);
  expect(r2?.cash).toBe(cashBefore);

  // Round 2: trade, run a few days, then quit mid-round.
  await sellBullPut(page);
  await expect(page.getByTestId('pace')).toBeVisible();
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  // Let any open decision settle to a quiet point, then read the state.
  for (let i = 0; i < 20 && (await page.getByTestId('decision-modal').isVisible()); i++) {
    const hold = page.getByTestId('dp-hold');
    if (await hold.count()) await hold.click();
    else await page.getByTestId('dp-sell_shares').or(page.getByTestId('dp-close')).first().click();
    await page.waitForTimeout(150);
    if (
      await page
        .getByTestId('play-button')
        .textContent()
        .then((t) => t?.includes('PAUSE'))
    )
      await page.keyboard.press('Space');
  }
  await page.waitForTimeout(500);
  const midState = await runState(page);
  const midPositions = await page.evaluate(
    () =>
      (window as unknown as { __stg: Stg }).__stg.run
        .getState()
        .engine?.session?.positions.map((p) => ({ id: p.id, status: p.status })) ?? null,
  );
  await app.close();

  // Resume in a fresh process from the autosave.
  ({ app, page } = await launchGame({ userData }));
  await fastClock(page);
  await page.getByTestId('menu-career').click();
  await expect(page.getByTestId('save-panel')).toBeVisible();
  await page.getByTestId('continue-run').click();
  await expect(page.getByTestId('run-topbar').or(page.getByTestId('tally-screen'))).toBeVisible({
    timeout: 60_000,
  });
  const back = await runState(page);
  expect(back).toEqual(midState);
  const backPositions = await page.evaluate(
    () =>
      (window as unknown as { __stg: Stg }).__stg.run
        .getState()
        .engine?.session?.positions.map((p) => ({ id: p.id, status: p.status })) ?? null,
  );
  expect(backPositions).toEqual(midPositions);
  await shot(page, '06-resumed-1920');

  // Let the bot finish the year through the same store actions, stopping to look at the Review.
  let sawReview = false;
  for (let i = 0; i < 400; i++) {
    const st = await runState(page);
    if (!st || st.phase === 'victory' || st.phase === 'defeat') break;
    if (st.phase === 'review_intro' && !sawReview) {
      await expect(page.getByTestId('review-intro')).toBeVisible();
      await page.waitForTimeout(1200);
      await shot(page, '06-review-1920');
      sawReview = true;
    }
    await page.evaluate(() => (window as unknown as { __stg: Stg }).__stg.botPlay('disciplined', 1));
  }
  expect(sawReview).toBe(true);
  const end = await runState(page);
  expect(['victory', 'defeat']).toContain(end?.phase);
  expect(end?.history.length).toBe(12);
  await expect(page.getByTestId('run-end')).toBeVisible();
  await expect(page.getByTestId('run-end-title')).toHaveText(/PRACTICE COMPLETE/);
  await shot(page, '06-run-end-1920');
  // The finished run leaves no save behind and its trades reach Stats.
  await page.getByRole('button', { name: 'STATS' }).click();
  await expect(page.getByTestId('stats-screen')).toBeVisible();
  await page.getByTestId('open-achievements').click();
  await expect(page.getByTestId('achievements-screen')).toBeVisible();
  await expect(page.getByTestId('ach-first_blood')).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, '07-achievements-1920');
  await app.close();
});
