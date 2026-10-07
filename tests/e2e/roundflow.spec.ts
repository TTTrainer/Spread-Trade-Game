import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dismissBoard, launchGame, shot } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function settings(page: Page, game: Record<string, unknown>): Promise<void> {
  // Settings load on boot; change them only after that, or the load overwrites the change.
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.evaluate((g) => {
    (window as Any).__stg.app.getState().updateSettings((x: Any) => ({ ...x, game: { ...x.game, ...g } }));
  }, game);
}

async function startRun(page: Page, seed: string): Promise<void> {
  await page.evaluate(
    (s) => (window as Any).__stg.run.getState().newRun({ deskId: 'verticals', seed: s, practice: true }),
    seed,
  );
  await page.evaluate(() => (window as Any).__stg.app.getState().go('run'));
  await expect(page.getByTestId('run-topbar')).toBeVisible({ timeout: 60_000 });
  await dismissBoard(page);
}

const day = (page: Page) =>
  page.evaluate(() => (window as Any).__stg.trading.getState().session?.dayIndex ?? 0);

test('watch a day before trading, then trade on day 1; a sit-out locks trading and pays at the end', async () => {
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await settings(page, { dayPace: 'step', pauseOnTest: false });
  await startRun(page, 'e2e-flow');
  await expect(page.getByTestId('trade-window')).toContainText('10 days');

  // No trade yet: Space lets a day pass anyway, and untraded cards move with it.
  await page.keyboard.press('Space');
  await expect.poll(() => day(page)).toBe(1);
  await expect(page.getByTestId('day-recap')).toBeVisible();
  await expect(page.getByTestId('recap-watch')).toBeVisible();
  // The new day's candle is on the chart and in view.
  const bar = await page.evaluate(() => {
    const w = window as Any;
    const t = w.__stg.trading.getState();
    return { last: w.__stg.chart.lastBar(), now: t.session.view(t.selectedCardId).now };
  });
  expect(bar.last).toEqual({ date: bar.now, inView: true });
  await shot(page, '12-watch-day-1920');
  await page.locator('.dr-x').click();
  await expect(page.getByTestId('trade-window')).toContainText('9 days');

  // Trade on day 1: the builder is live between days.
  await page.keyboard.press('4');
  await page.getByTestId('structure-bull_put').click();
  // Orders are market by default.
  await page.keyboard.press('Alt+S');
  await expect(page.getByTestId('toasts')).toContainText('Filled');
  const used = await page.evaluate(() => (window as Any).__stg.run.getState().engine.state.round.ticketsUsed);
  expect(used).toBe(1);
  await shot(page, '12-trade-day-1-1920');
  await shot(page, '12-trade-day-1-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await app.close();

  // A fresh run: sit Month 1 out.
  const second = await launchGame();
  const p2 = second.page;
  await settings(p2, { dayPace: 'step', pauseOnTest: false });
  await startRun(p2, 'e2e-sitout');
  await p2.keyboard.press('k');
  await expect(p2.getByTestId('sitout')).toContainText('SITTING OUT');
  await shot(p2, '12-sitout-1920');
  // Each press plays one day; wait for it to finish before the next.
  const settled = () =>
    p2.evaluate(() => {
      const t = (window as Any).__stg.trading.getState();
      return t.ff !== 'running' && !t.dayAnim;
    });
  for (let i = 0; i < 6; i++) {
    if ((await p2.getByTestId('sitout').count()) === 0) break;
    await expect.poll(settled, { timeout: 20_000 }).toBe(true);
    await p2.keyboard.press('Space');
    await p2.waitForTimeout(300);
  }
  await expect
    .poll(() => p2.evaluate(() => (window as Any).__stg.run.getState().engine.state.roundIndex), {
      timeout: 30_000,
    })
    .toBe(1);
  expect(errors).toEqual([]);
  await second.app.close();
});

test('developer mode: notes, unlock everything and run levers', async () => {
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await settings(page, { devMode: true });
  await expect(page.getByTestId('dev-fab')).toBeVisible();
  await page.keyboard.press('Control+Shift+D');
  const panel = page.getByTestId('dev-panel');
  await expect(panel).toBeVisible();
  await panel.getByTestId('dev-note').fill('The shop reroll feels pricey in Q2.');
  await panel.getByTestId('dev-add-note').click();
  await expect(panel.locator('.dev-n')).toContainText('reroll feels pricey');
  await panel.getByTestId('dev-unlock').click();
  await expect(page.getByTestId('toasts')).toContainText('Everything unlocked');
  await page.keyboard.press('Escape');
  await startRun(page, 'e2e-dev');
  const cash = () => page.evaluate(() => (window as Any).__stg.run.getState().engine.state.cash as number);
  const c0 = await cash();
  await page.getByTestId('dev-fab').click();
  await panel.getByTestId('dev-cash').click();
  await expect.poll(cash).toBe(c0 + 10);
  await panel.getByTestId('dev-cart-pick').selectOption('iv_crusher');
  await panel.getByTestId('dev-cart-give').click();
  await expect
    .poll(() => page.evaluate(() => (window as Any).__stg.run.getState().engine.state.cartridges as string[]))
    .toContain('iv_crusher');
  await shot(page, '12-dev-panel-1920');
  await shot(page, '12-dev-panel-1366', { width: 1366, height: 768 });
  const desks = await page.evaluate(() => (window as Any).__stg.profile.getState().profile.desks.length);
  expect(desks).toBeGreaterThan(1);
  expect(errors).toEqual([]);
  await app.close();
});

test('developer test checklist: what changed since 1.6, one click to each spot, and the file for the dev', async () => {
  test.setTimeout(180_000);
  const { app, page, exportDir } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${e.message} ${e.stack ?? ''}`));
  await settings(page, { devMode: true });
  const openChecklist = async () => {
    await page.keyboard.press('Control+Shift+D');
    await page.getByTestId('dev-tab-checklist').click();
    await expect(page.getByTestId('dev-checklist')).toBeVisible();
  };
  await openChecklist();
  // Only what changed since 1.6, each tagged with its release; the 1.6 checks are gone.
  await expect(page.getByTestId('check-tb-badge')).toContainText('1.7.0');
  await expect(page.getByTestId('check-learn-quiz')).toContainText('1.8.0');
  await expect(page.getByTestId('check-tb-tickers')).toContainText('1.8.1');
  await expect(page.getByTestId('check-menu-basics')).toHaveCount(0);
  await page.getByTestId('check-ok-menu-emblems').click();
  await page.getByTestId('check-issue-run-rules').click();
  await page.getByTestId('check-note-run-rules').fill('Slider went past 10.');
  await expect(page.getByTestId('check-menu-emblems')).toHaveClass(/ok/);
  await page.waitForTimeout(300);
  await shot(page, '12-dev-checklist-1920');
  await shot(page, '12-dev-checklist-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });

  // SAVE AS FILE: one file for the dev, stamped with the version, by group, with the notes.
  await page.getByTestId('check-export').click();
  await expect(page.getByTestId('toasts')).toContainText('Checklist saved');
  const file = readdirSync(exportDir).find((f) => f.startsWith('test-checklist-'));
  expect(file).toMatch(/^test-checklist-\d+\.\d+\.\d+\.md$/);
  const md = readFileSync(join(exportDir, file as string), 'utf8');
  expect(md).toMatch(/^# Test checklist · Spread Trading Game \d+\.\d+\.\d+/);
  expect(md).toContain('## Trade Builder');
  expect(md).toContain('- [x] **Emblems and the deal-in** (1.7.0)');
  expect(md).toContain('- [!] **Controls follow the rules** (1.7.0): Slider went past 10.');

  // SET UP into a LEARN OPTIONS lesson: the Trade Builder opens at that lesson.
  await page.getByTestId('check-setup-learn-quiz').click();
  await expect(page.getByTestId('builder-screen')).toBeVisible();
  await expect(page.getByTestId('course')).toHaveAttribute('data-lesson', 'call', { timeout: 60_000 });
  // ...the full ticker list...
  await openChecklist();
  await page.getByTestId('check-setup-tb-tickers').click();
  await expect(page.getByTestId('ticker-list')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('ticker-list')).toContainText('Index options (cash-settled)');
  await page.keyboard.press('Escape');
  // ...a run with the rules on: no SIT OUT under the Attendance Policy...
  await openChecklist();
  await page.getByTestId('check-setup-run-rules').click();
  // The Trade Builder shows a trading screen too, so wait for the run itself.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const stg = (window as Any).__stg;
          return stg.app.getState().screen === 'run'
            ? (stg.run.getState().engine?.state.config.compliance ?? null)
            : null;
        }),
      { timeout: 60_000 },
    )
    .toEqual(['liquidity', 'no_market', 'no_skip']);
  // ...and a boss's case file.
  await openChecklist();
  await page.getByTestId('check-setup-boss-tax-man').click();
  await expect(page.getByTestId('review-intro')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('boss-name')).toHaveText('THE TAX MAN');
  // The ticks and notes are kept.
  await openChecklist();
  await expect(page.getByTestId('check-note-run-rules')).toHaveValue('Slider went past 10.');
  expect(errors, errors.join('\n')).toEqual([]);
  await app.close();
});
