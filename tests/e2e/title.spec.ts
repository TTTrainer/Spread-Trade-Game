import { expect, test } from '@playwright/test';
import { launchGame, shot } from './helpers';

test('title screen opens with no default menu', async () => {
  const { app, page } = await launchGame();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  const hasMenu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu() !== null);
  expect(hasMenu).toBe(false);
  await shot(page, '00-title-1920');
  await shot(page, '00-title-1366', { width: 1366, height: 768 });
  await app.close();
});
