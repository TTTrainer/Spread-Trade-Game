import { expect, test, type Page } from '@playwright/test';
import { launchGame } from './helpers';

/** Every screen on the title menu, by its menu test id and the screen it opens. */
const MENU: { id: string; screen: string }[] = [
  { id: 'menu-career', screen: 'career-screen' },
  { id: 'menu-daily', screen: 'daily-screen' },
  { id: 'menu-drills', screen: 'drills-menu' },
  { id: 'menu-live', screen: 'live-screen' },
  { id: 'menu-contracts', screen: 'contracts-screen' },
  { id: 'menu-sandboxSetup', screen: 'sandbox-setup' },
  { id: 'menu-stats', screen: 'stats-screen' },
  { id: 'menu-pad', screen: 'pad-screen' },
  { id: 'menu-settings', screen: 'settings-screen' },
  { id: 'menu-credits', screen: 'credits-screen' },
];

const backButton = (page: Page) => page.getByRole('button', { name: /^(◀ )?BACK$/ }).first();

test('every title menu screen opens, and its BACK returns to the title', async () => {
  const { app, page } = await launchGame();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  for (const m of MENU) {
    await page.getByTestId(m.id).click();
    await expect(page.getByTestId(m.screen), m.id).toBeVisible({ timeout: 15_000 });
    await backButton(page).click();
    await expect(page.getByTestId('title-screen'), `${m.id} back`).toBeVisible();
  }
  // The back hotkey does the same.
  await page.getByTestId('menu-stats').click();
  await expect(page.getByTestId('stats-screen')).toBeVisible();
  await page.keyboard.press('Control+Backquote');
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await app.close();
});

test('Live: desk, back to Live, then BACK goes home instead of looping', async () => {
  const { app, page } = await launchGame();
  await page.getByTestId('menu-live').click();
  await expect(page.getByTestId('live-screen')).toBeVisible();
  await expect(page.getByTestId('live-wip')).toContainText('WORK IN PROGRESS');
  await page.getByTestId('live-open-desk').click();
  await expect(page.getByTestId('trading-screen')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('live-back').click();
  await expect(page.getByTestId('live-screen')).toBeVisible();
  await backButton(page).click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  // And again, to make sure the second visit doesn't loop either.
  await page.getByTestId('menu-live').click();
  await page.getByTestId('live-open-desk').click();
  await expect(page.getByTestId('trading-screen')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('live-back').click();
  await backButton(page).click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await app.close();
});

test('second-level screens: each way back lands where you came from, and home stays home', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchGame();
  await expect(page.getByTestId('title-screen')).toBeVisible();

  // Drills: a drill's QUIT returns to the drill menu, whose BACK goes home.
  await page.getByTestId('menu-drills').click();
  await page.getByTestId('drill-mixed').click();
  await expect(page.getByTestId('drill-session')).toBeVisible();
  await page.getByRole('button', { name: '◀ QUIT' }).click();
  await expect(page.getByTestId('drills-menu')).toBeVisible();
  await backButton(page).click();
  await expect(page.getByTestId('title-screen')).toBeVisible();

  // Achievements from Stats, and from Career: BACK returns to whichever opened it.
  await page.getByTestId('menu-stats').click();
  await page.getByTestId('open-achievements').click();
  await expect(page.getByTestId('achievements-screen')).toBeVisible();
  await backButton(page).click();
  await expect(page.getByTestId('stats-screen')).toBeVisible();
  await backButton(page).click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByTestId('menu-career').click();
  await page.getByTestId('career-achievements').click();
  await expect(page.getByTestId('achievements-screen')).toBeVisible();
  await backButton(page).click();
  await expect(page.getByTestId('career-screen')).toBeVisible();
  await backButton(page).click();
  await expect(page.getByTestId('title-screen')).toBeVisible();

  // A contract: ◀ BOARD returns to the board, whose BACK goes home.
  await page.getByTestId('menu-contracts').click();
  await expect(page.locator('.contract')).toHaveCount(5, { timeout: 30_000 });
  await page.locator('[data-testid^="accept-"]').first().click();
  await expect(page.getByTestId('contract-checklist')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('contract-back').click();
  await expect(page.getByTestId('contracts-screen')).toBeVisible();
  await backButton(page).click();
  await expect(page.getByTestId('title-screen')).toBeVisible();

  // Sandbox: ◀ HOME from the desk goes home; the setup's BACK does too.
  await page.getByTestId('menu-sandboxSetup').click();
  await page.getByTestId('sandbox-start').click();
  await expect(page.getByTestId('trading-screen')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: '◀ HOME' }).first().click();
  await expect(page.getByTestId('title-screen')).toBeVisible();

  // A Career run: SAVE & EXIT goes home, and Career's BACK afterwards still goes home.
  await page.getByTestId('menu-career').click();
  await page.getByTestId('start-run').click();
  // SAVE & EXIT from the month menu goes home; so does the top bar's after the month starts.
  await page.getByTestId('mm-exit').click({ timeout: 60_000 });
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByTestId('menu-career').click();
  await page.getByTestId('continue-run').click();
  await page.getByTestId('board-play').click({ timeout: 60_000 });
  await page.getByTestId('run-menu').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByTestId('menu-career').click();
  await expect(page.getByTestId('career-screen')).toBeVisible();
  await backButton(page).click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await app.close();
});
