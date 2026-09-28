import { expect, test, type Page } from '@playwright/test';
import { launchGame, shot } from './helpers';

async function answerCurrent(page: Page): Promise<void> {
  const session = page.getByTestId('drill-session');
  await expect(session.getByTestId('drill-chart').or(session.getByTestId('choice-0')).first()).toBeVisible({
    timeout: 20000,
  });
  if (await page.getByTestId('dcall-3').count()) {
    await page.keyboard.press('4');
    await page.keyboard.press('Shift+2');
    await page.keyboard.press('Enter');
  } else if (await page.getByTestId('iv-slider').count()) {
    await page.getByTestId('iv-slider').fill('0.4');
    await page.getByTestId('drill-submit').click();
  } else if (await page.getByTestId('choice-0').count()) {
    await page.getByTestId('choice-0').click();
  } else {
    // Expected-move darts: drag a range across the middle of the chart.
    const box = await page.getByTestId('drill-chart').boundingBox();
    if (!box) throw new Error('no chart');
    await page.mouse.move(box.x + 400, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + 400, box.y + box.height * 0.7, { steps: 4 });
    await page.mouse.up();
    await page.getByTestId('drill-submit').click();
  }
  await expect(page.getByTestId('drill-result')).toBeVisible({ timeout: 20000 });
}

test('a 10-question adaptive drill completes and its results are stored', async () => {
  const { app, page } = await launchGame();
  await page.getByTestId('menu-drills').click();
  await expect(page.getByTestId('drills-menu')).toBeVisible();
  await shot(page, '04-drills-menu-1920');
  await page.getByTestId('drill-mixed').click();
  const seen = new Set<string>();
  for (let i = 0; i < 10; i++) {
    await answerCurrent(page);
    const title = (await page.locator('.drill-top span').first().textContent()) ?? '';
    seen.add(title.split('·')[0].trim());
    if (i === 0) await shot(page, '04-drill-question-1920');
    if (i === 1) await shot(page, '04-drill-question-1366', { width: 1366, height: 768 });
    await page.getByTestId('drill-next').click();
  }
  await expect(page.getByTestId('drill-summary')).toBeVisible({ timeout: 20000 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await shot(page, '04-drill-summary-1920');
  const stored = await page.evaluate(async () => {
    const stg = (
      window as unknown as { stg: { invoke: (c: string) => Promise<{ detail: { results: unknown[] } }[]> } }
    ).stg;
    const rows = await stg.invoke('user.drills');
    return rows.map((r) => r.detail.results.length);
  });
  expect(stored).toEqual([10]);
  console.log('drill kinds seen:', [...seen].join(', '));
  await page.getByTestId('drill-exit').click();
  await expect(page.getByTestId('drills-menu')).toBeVisible();
  await app.close();
});
