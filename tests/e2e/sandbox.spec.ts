import { expect, test, type Page } from '@playwright/test';
import { launchGame, shot } from './helpers';

type Stg = {
  app: { getState: () => { updateSettings: (f: (s: unknown) => unknown) => void } };
  trading: {
    getState: () => {
      session: {
        positions: { realizedCents: number | null; exitReason: string | null; status: string }[];
        realizedCents: number;
      } | null;
      ff: string;
    };
  };
};

async function ffUntilDone(page: Page, maxDecisions = 40): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 400; i++) {
    const state = await page.evaluate(
      () => (window as unknown as { __stg: Stg }).__stg.trading.getState().ff,
    );
    if (state === 'done') return seen;
    // Days with news (and recaps) hold the clock; keep it going.
    if (state === 'paused') await page.keyboard.press('Space');
    if (state === 'decision') {
      const title = (await page.getByTestId('decision-modal').locator('h2').textContent()) ?? '';
      seen.push(title);
      if (seen.length === 1) await shot(page, '03-decision-1920');
      // Hold through everything so the trade reaches expiration.
      const hold = page.getByTestId('dp-hold');
      if (await hold.count()) await hold.click();
      else await page.getByTestId('dp-sell_shares').or(page.getByTestId('dp-close')).first().click();
      if (seen.length > maxDecisions) throw new Error('too many decisions');
    }
    await page.waitForTimeout(100);
  }
  throw new Error('fast-forward did not finish');
}

test('sandbox: place a bull put, fast-forward to expiry, P/L matches the engine', async () => {
  const { app, page } = await launchGame();
  await page.evaluate(() => {
    const stg = (window as unknown as { __stg: Stg }).__stg;
    stg.app.getState().updateSettings((s) => ({
      ...(s as object),
      // This test also covers the optional confirm box.
      game: {
        ...(s as { game: object }).game,
        ffSecondsPerDay: 0.06,
        confirmOrders: true,
        pauseOnTest: false,
        dayPace: '4',
      },
    }));
  });
  await page.getByTestId('menu-sandboxSetup').click();
  await expect(page.getByTestId('sandbox-setup')).toBeVisible();
  await page.getByTestId('sym-ORGR').click();
  await expect(page.getByTestId('date-label')).toContainText('20');
  await page.locator('input.capital').fill('20000');
  await shot(page, '03-sandbox-setup-1920');
  await page.getByTestId('sandbox-start').click();
  await expect(page.getByTestId('trading-screen')).toBeVisible();
  // A fresh card opens on the news brief: the street read, the backdrop and recent headlines.
  await expect(page.getByTestId('news-brief')).toBeVisible();
  await expect(page.getByTestId('street-chip').first()).toBeVisible();
  await page.getByTestId('street-chip').first().hover();
  await expect(page.getByTestId('tooltip')).toContainText('Street read');
  await shot(page, '03-brief-1920');
  await shot(page, '03-brief-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const w of ['bw-street', 'bw-price', 'bw-momentum', 'bw-vol', 'bw-market', 'bw-timeline', 'bw-news'])
    await expect(page.getByTestId(w).first()).toBeVisible();
  await page.getByTestId('brief-expand').click();
  await expect(page.getByTestId('brief-big')).toBeVisible();
  await shot(page, '03-brief-big');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('brief-big')).toBeHidden();

  // "Up" picks a bull put and the panel flips to the trade view; 70% conviction; then sell the
  // default ~30-delta bull put at market.
  await page.keyboard.press('4');
  await page.keyboard.press('Shift+3');
  await expect(page.getByTestId('view-chip')).toContainText('UP');
  await expect(page.getByTestId('payoff-chart')).toBeVisible();
  await expect(page.getByTestId('stat-pop')).toBeVisible();
  await page.getByTestId('order-market').click();
  await shot(page, '03-builder-1920');
  await shot(page, '03-builder-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.keyboard.press('Alt+S');
  await expect(page.getByTestId('confirm-order')).toBeVisible();
  await page.getByTestId('confirm-send').click();
  await expect(page.getByTestId('toasts')).toContainText('Filled');
  await expect(page.getByTestId('lineup')).toContainText('%');

  // The roll dialog shows where the strikes go and stay-versus-roll payoffs (cancelled here).
  await page.keyboard.press('Control+1');
  await page.getByRole('button', { name: 'ROLL', exact: true }).first().click();
  const roll = page.getByTestId('roll-dialog');
  await expect(roll.getByTestId('roll-payoff')).toBeVisible();
  await expect(roll.getByTestId('roll-compare')).toContainText('Chance of profit');
  await roll.getByTestId('roll-shift').getByRole('slider').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(roll.getByTestId('roll-shift')).toContainText('down 1');
  await shot(page, '03-roll-1920');
  await shot(page, '03-roll-1366', { width: 1366, height: 768 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await roll.getByRole('button', { name: 'CANCEL' }).click();
  await expect(roll).toBeHidden();
  await page.keyboard.press('Control+2');

  // Start the clock and hold through every decision point to expiration.
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  await shot(page, '03-running-1920');
  const decisions = await ffUntilDone(page);
  console.log('decision points seen:', decisions.join(' | '));

  await expect(page.getByTestId('debrief')).toBeVisible();
  const engine = await page.evaluate(() => {
    const s = (window as unknown as { __stg: Stg }).__stg.trading.getState().session;
    return s ? { pos: s.positions[0], total: s.realizedCents } : null;
  });
  expect(engine?.pos.status).toBe('closed');
  expect(['expired', 'assigned', 'window_end']).toContain(engine?.pos.exitReason);
  const shown = (await page.getByTestId('receipt-pl-0').textContent()) ?? '';
  const cents = engine?.pos.realizedCents ?? 0;
  const dollars = (Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  expect(shown).toContain(dollars);
  expect(shown).toContain(cents > 0 ? '▲' : cents < 0 ? '▼' : '■');
  await page.waitForTimeout(900);
  await page.getByTestId('receipt-toggle-0').click();
  await expect(page.getByTestId('attribution')).toBeVisible();
  await shot(page, '03-debrief-1920');
  await shot(page, '03-debrief-1366', { width: 1366, height: 768 });
  await app.close();
});
