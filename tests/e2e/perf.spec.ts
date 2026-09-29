import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchGame, screenshotDir } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

interface FrameStats {
  frames: number;
  seconds: number;
  fps: number;
  p50: number;
  p95: number;
  over33: number;
  longTasks: number;
  longestTask: number;
}

/** Count frames and main-thread stalls (long tasks over 50 ms) for a few seconds. */
async function measure(page: Page, ms: number): Promise<FrameStats> {
  return page.evaluate(async (dur) => {
    const gaps: number[] = [];
    const tasks: number[] = [];
    const obs = new PerformanceObserver((l) => l.getEntries().forEach((e) => tasks.push(e.duration)));
    try {
      obs.observe({ entryTypes: ['longtask'] });
    } catch {
      /* not supported */
    }
    const t0 = performance.now();
    let last = t0;
    await new Promise<void>((done) => {
      const f = (t: number) => {
        gaps.push(t - last);
        last = t;
        if (t - t0 < dur) requestAnimationFrame(f);
        else done();
      };
      requestAnimationFrame(f);
    });
    obs.disconnect();
    const sorted = gaps.slice(1).sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
    const seconds = (last - t0) / 1000;
    return {
      frames: gaps.length,
      seconds,
      fps: gaps.length / seconds,
      p50: q(0.5),
      p95: q(0.95),
      over33: sorted.filter((g) => g > 33.4).length,
      longTasks: tasks.length,
      longestTask: tasks.length ? Math.max(...tasks) : 0,
    };
  }, ms);
}

test('fast-forward stays smooth: frame times and main-thread stalls', async () => {
  const { app, page } = await launchGame();
  await page.waitForFunction(() => (window as Any).__stg !== undefined);
  // Settings load on boot: change them after that, or the load overwrites the change.
  await expect(page.getByTestId('title-screen')).toBeVisible();
  // Don't stop for decisions while measuring.
  await page.evaluate(() =>
    (window as Any).__stg.app.getState().updateSettings((s: Any) => ({
      ...s,
      game: {
        ...s.game,
        // Measure the busiest pace: candles forming at 4x, back to back.
        dayPace: '4',
        pauseOnTest: false,
        pause: Object.fromEntries(Object.keys(s.game.pause).map((k) => [k, false])),
      },
    })),
  );
  await page.getByTestId('menu-sandboxSetup').click();
  await page.getByTestId('sym-ORGR').click();
  await expect(page.getByTestId('date-label')).toContainText('20');
  await page.locator('input.capital').fill('20000');
  await page.getByTestId('sandbox-start').click();
  await expect(page.getByTestId('trading-screen')).toBeVisible();
  const idle = await measure(page, 3000);
  await page.keyboard.press('4');
  await page.keyboard.press('Shift+3');
  await page.getByTestId('order-market').click();
  await page.keyboard.press('Alt+S');
  await expect(page.getByTestId('toasts')).toContainText('Filled');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const trace = page.evaluate(async () => {
    // Days advanced per second while the clock is actually running (the trade may close early).
    const t0 = performance.now();
    const d0 = (window as Any).__stg.trading.getState().session.dayIndex;
    let t1 = t0;
    let d1 = d0;
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const t = (window as Any).__stg.trading.getState();
      if (t.ff !== 'running') break;
      t1 = performance.now();
      d1 = t.session.dayIndex;
    }
    return { days: d1 - d0, seconds: (t1 - t0) / 1000 };
  });
  const ff = await measure(page, 6000);
  const pace = await trace;
  const days = await page.evaluate(() => (window as Any).__stg.trading.getState().session.dayIndex);
  const secsPerDay = await page.evaluate(
    () => (window as Any).__stg.app.getState().settings.game.ffSecondsPerDay,
  );
  const report = {
    idle,
    ff,
    daysAdvanced: days,
    pace,
    secsPerDay,
    note: 'xvfb + software GL in the cloud; a real GPU is faster',
  };
  console.log(JSON.stringify(report, null, 2));
  writeFileSync(join(screenshotDir, '..', 'perf.json'), JSON.stringify(report, null, 2));
  // The main thread must never stall long enough to drop a run of frames.
  expect(ff.longestTask).toBeLessThan(250);
  expect(ff.p50).toBeLessThan(20);
  // The clock keeps its pace: at least 70% of the days per second 4x asks for.
  expect(days).toBeGreaterThan(3);
  expect(pace.days / pace.seconds).toBeGreaterThanOrEqual((4 / secsPerDay) * 0.7);
  await app.close();
});
