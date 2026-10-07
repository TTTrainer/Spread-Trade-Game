import { expect, test } from '@playwright/test';
import { launchGame, shot } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The Trade Builder on the SIM market (E2E never calls Schwab): a ticker opens on its newest day
 * with an honest freshness note, studies toggle from the tray, any strategy builds and edits leg
 * by leg, the payoff opens full size, and the order copies as text. Nothing is placed.
 */
test('trade builder: open a ticker, build a condor leg by leg, read its payoff, copy the order', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message} ${e.stack ?? ''}`));
  await page.getByTestId('menu-builder').click();
  await expect(page.getByTestId('builder-screen')).toBeVisible();
  await expect(page.getByTestId('trading-screen')).toBeVisible({ timeout: 60_000 });
  // The SIM market ends in the past: the builder says so plainly.
  await expect(page.getByTestId('builder-fresh')).toHaveAttribute('data-state', 'stale');
  await expect(page.getByTestId('builder-fresh')).toContainText('OUT OF DATE');
  await expect(page.getByTestId('chart-symbol')).toBeVisible();
  // No clock here: today is the last day, so there is no play bar.
  await expect(page.getByTestId('ff-bar')).toHaveCount(0);
  // Size is a plain contract count.
  await expect(page.getByTestId('slider-contracts')).toBeVisible();
  await expect(page.getByTestId('slider-conviction')).toHaveCount(0);

  // A study toggles from the tray.
  const em2 = page.getByTestId('study-em2');
  await expect(em2).toHaveAttribute('aria-pressed', 'false');
  await em2.click();
  await expect(em2).toHaveAttribute('aria-pressed', 'true');

  // Any strategy: an iron condor, with its four legs editable.
  await page.getByTestId('structure-iron_condor').click();
  await expect(page.getByTestId('legs-editor').locator('tr')).toHaveCount(4);
  await expect(page.getByTestId('builder-order')).toContainText('IRON CONDOR');
  await expect(page.getByTestId('builder-net')).toBeVisible();
  const before = await page.getByTestId('builder-order').textContent();
  const strike = page.getByTestId('leg-0-strike');
  const options = await strike.locator('option').allTextContents();
  const cur = await strike.inputValue();
  const next = options.find((o) => o !== cur)!;
  await strike.selectOption(next);
  await expect(page.getByTestId('legs-reset')).toBeVisible();
  await expect.poll(() => page.getByTestId('builder-order').textContent()).not.toBe(before);
  await page.getByTestId('legs-reset').click();
  await expect(page.getByTestId('legs-reset')).toHaveCount(0);
  await shot(page, '22-builder-1920');

  // The payoff, full size: plain words, the legs, a hover readout, a date slider.
  await page.getByTestId('ctab-payoff').click();
  await expect(page.getByTestId('payoff-studio')).toBeVisible();
  await expect(page.getByTestId('payoff-say')).toContainText('You SELL the iron condor');
  await expect(page.getByTestId('payoff-legs').locator('div')).toHaveCount(4);
  const svg = page.getByTestId('payoff-svg');
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(page.getByTestId('payoff-hover')).toContainText('at expiration');
  await page.getByTestId('ps-days').fill('5');
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
  await expect(page.getByTestId('payoff-hover')).toContainText('in 5 days');
  await shot(page, '22-builder-payoff-1920');
  await shot(page, '22-builder-payoff-1366', { width: 1366, height: 768 });
  await page.getByTestId('ctab-chart').click();
  await expect(page.getByTestId('payoff-studio')).toHaveCount(0);
  await shot(page, '22-builder-1366');
  await page.setViewportSize({ width: 1920, height: 1080 });

  // COPY ORDER copies text (or says plainly that the copy failed); nothing is placed.
  await page.getByTestId('builder-copy').click();
  await expect(page.getByTestId('toasts')).toContainText(/Order copied|Copy failed/);
  const placed = await page.evaluate(() => (window as any).__stg.trading.getState().session.positions.length);
  expect(placed).toBe(0);

  // Another ticker by typing it.
  const syms: string[] = await page.evaluate(() =>
    (window as any).__stg.trading.getState().session.cards.map((c: any) => c.realSymbol),
  );
  const list = await page.evaluate(() => (window as any).__stg.builder.getState().list.tickers);
  const other = list.find((t: any) => t.savedThrough && !syms.includes(t.symbol)).symbol as string;
  await page.getByTestId('ticker-input').fill(other);
  await page.getByTestId('ticker-input').press('Enter');
  await expect
    .poll(() => page.evaluate(() => (window as any).__stg.trading.getState().session.cards.length))
    .toBe(2);
  // A ticker with no data says so instead of failing quietly.
  await page.getByTestId('ticker-input').fill('QQQ');
  await page.getByTestId('ticker-input').press('Enter');
  await expect(page.getByTestId('toasts')).toContainText('No data for QQQ');
  // An index typed the way Schwab and thinkorswim write it.
  await page.getByTestId('ticker-input').fill('$SPX');
  await page.getByTestId('ticker-input').press('Enter');
  await expect(page.getByTestId('toasts')).toContainText('No data for SPX');
  // The full list, with the new tickers marked and the index options in their own group.
  await page.getByTestId('ticker-all').click();
  await expect(page.getByTestId('ticker-list')).toContainText('Added for the Trade Builder');
  await expect(page.getByTestId('ticker-list')).toContainText('Index options (cash-settled)');
  await expect(page.getByTestId('pick-XSP')).toBeVisible();
  await shot(page, '22-builder-tickers-1920');
  await page.keyboard.press('Escape');

  await page.getByTestId('builder-back').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
  await app.close();
});

/**
 * Trade Builder v2: LEARN OPTIONS. Each lesson sets up its trade on the open ticker; a lesson with
 * a question waits for an answer, one with a task waits for the player to do it.
 */
test('learn options: lessons set up real trades, questions explain, tasks wait for the player', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message} ${e.stack ?? ''}`));
  await page.getByTestId('menu-builder').click();
  await expect(page.getByTestId('trading-screen')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('builder-learn').click();
  const course = page.getByTestId('course');

  // Get paid to wait: SELL waits for the line to sit under the floor, then the month plays out.
  await expect(course).toHaveAttribute('data-lesson', 'wait');
  await expect(page.getByTestId('course-replay')).toBeVisible();
  await expect(page.getByTestId('course-sell')).toBeDisabled();
  await expect(page.getByTestId('course-next')).toBeDisabled();
  await shot(page, '23-learn-1920');
  const fig = page.locator('.cr-fig');
  const box = (await fig.boundingBox())!;
  // Drag the line near the bottom of the chart: well under any floor.
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.97, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('course-sell')).toBeEnabled();
  await page.getByTestId('course-sell').click();
  await page.getByTestId('course-play').click();
  await expect(page.getByTestId('course-result')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('course-days-safe')).toContainText(/DAYS SAFE \d+ \/ \d+/);
  await shot(page, '23-learn-replay-1920');
  await shot(page, '23-learn-replay-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.getByTestId('course-next')).toBeEnabled();
  await page.getByTestId('course-next').click();

  // The same trade as a picture: a sold put on the payoff, and a question that waits.
  await expect(course).toHaveAttribute('data-lesson', 'picture');
  await expect(page.getByTestId('payoff-studio')).toBeVisible();
  await expect(page.getByTestId('course-next')).toBeDisabled();
  await page.getByTestId('course-opt-0').click();
  await expect(page.getByTestId('course-why')).toContainText('Not quite');
  await expect(page.getByTestId('course-next')).toBeEnabled();
  await shot(page, '23-learn-quiz-1920');
  await page.getByTestId('course-next').click();

  // A safer line: the task waits for POP 75–85%.
  await expect(course).toHaveAttribute('data-lesson', 'pop');
  await expect(page.getByTestId('course-next')).toBeDisabled();
  await page.getByTestId('course-next').click({ force: true });
  await expect(course).toHaveAttribute('data-lesson', 'pop');
  await page.getByTestId('course-back').click();
  await expect(course).toHaveAttribute('data-lesson', 'picture');
  await page.getByTestId('course-next').click();
  // Progress is saved: leave and come back to the same lesson.
  await expect(course).toHaveAttribute('data-lesson', 'pop');
  await page.getByTestId('builder-back').click();
  await page.getByTestId('menu-builder').click();
  await expect(page.getByTestId('trading-screen')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('builder-learn').click();
  await expect(page.getByTestId('course')).toHaveAttribute('data-lesson', 'pop');

  // The covered call replays the same way, upside down; the coached trade shows its checklist.
  await page.evaluate(() => {
    const w = window as any;
    w.__stg.app
      .getState()
      .updateSettings((x: any) => ({ ...x, game: { ...x.game, courseProgress: { idx: 3, done: [] } } }));
  });
  await page.getByTestId('builder-back').click();
  await page.getByTestId('menu-builder').click();
  await page.getByTestId('builder-learn').click();
  await expect(course).toHaveAttribute('data-lesson', 'cc');
  await expect(page.locator('.cr-level text')).toHaveText('CEILING');
  await page.evaluate(() => {
    const w = window as any;
    w.__stg.app
      .getState()
      .updateSettings((x: any) => ({ ...x, game: { ...x.game, courseProgress: { idx: 4, done: [] } } }));
  });
  await page.getByTestId('builder-back').click();
  await page.getByTestId('menu-builder').click();
  await page.getByTestId('builder-learn').click();
  await expect(course).toHaveAttribute('data-lesson', 'coached');
  await expect(page.getByTestId('course-checks')).toContainText('A cash-secured put');
  await expect(page.getByTestId('course-play')).toBeDisabled();
  await shot(page, '23-learn-coached-1920');
  expect(errors, errors.join('\n')).toEqual([]);
  await app.close();
});
