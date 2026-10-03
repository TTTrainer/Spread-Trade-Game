import { expect, test } from '@playwright/test';
import { launchGame, shot } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Covered calls carry an automatic stop that sizes their risk: a tighter stop is less risk (so a
 * pricier stock fits), the ticket shows the pick, and the filled trade keeps that stop.
 */
test('covered calls: the automatic stop sizes the risk and rides with the trade', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchGame();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.waitForFunction(() => (window as any).__stg !== undefined);
  await page.evaluate(async () => {
    const w = window as any;
    await w.__stg.run.getState().newRun({ deskId: 'income', seed: 'e2e-cc-stop', practice: true });
    w.__stg.app.getState().go('run');
    await w.__stg.run.getState().act({ t: 'boardDone' });
  });
  await expect(page.getByTestId('trading-screen')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('structure-covered_call').click();
  await expect(page.getByTestId('auto-stop')).toBeVisible();
  const risk = () =>
    page.evaluate(() => {
      const p = (window as any).__stg.trading.getState().plan();
      return p ? p.riskCents / p.qty : null;
    });
  await page.getByTestId('auto-stop-3').click();
  await expect.poll(risk).not.toBeNull();
  const wide = (await risk())!;
  await page.getByTestId('auto-stop-1').click();
  await expect(page.getByTestId('auto-stop-1')).toHaveClass(/on/);
  await expect.poll(risk).toBeLessThan(wide);
  // The 1x stop is a third of the 3x one, per contract.
  expect((await risk())! / wide).toBeCloseTo(1 / 3, 1);
  await page.waitForTimeout(300);
  await shot(page, '19-covered-call-auto-stop-1920');
  await page.keyboard.press('Alt+S');
  await expect(page.getByTestId('toasts')).toContainText('Filled');
  const pos = await page.evaluate(() => {
    const s = (window as any).__stg.trading.getState().session;
    const p = s.positions.find((x: any) => x.status === 'open');
    return { stop: p.brackets.stopPl, credit: -p.openNet, structure: p.structureId };
  });
  expect(pos.structure).toBe('covered_call');
  expect(pos.stop).toBeCloseTo(pos.credit, 6);
  await expect(page.getByTestId('stats-block')).toContainText('RISK AT AUTO STOP');
  expect(errors, errors.join('\n')).toEqual([]);
  await app.close();
});
