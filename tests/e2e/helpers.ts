import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface LaunchedGame {
  app: ElectronApplication;
  page: Page;
  userData: string;
  exportDir: string;
}

const root = process.cwd();
export const screenshotDir = join(root, 'test-results', 'screens');
mkdirSync(screenshotDir, { recursive: true });

/** Launch the built game against a throwaway user-data folder (or a given one, to test resume). */
export async function launchGame(
  opts: { userData?: string; env?: Record<string, string> } = {},
): Promise<LaunchedGame> {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'stg-e2e-'));
  const exportDir = join(userData, 'exports');
  mkdirSync(exportDir, { recursive: true });
  const app = await electron.launch({
    args: [join(root, 'out', 'main', 'index.js'), '--no-sandbox'],
    cwd: root,
    env: {
      ...process.env,
      STG_E2E: '1',
      STG_USER_DATA: userData,
      STG_EXPORT_DIR: exportDir,
      ...opts.env,
    } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, userData, exportDir };
}

export async function shot(
  page: Page,
  name: string,
  size?: { width: number; height: number },
): Promise<void> {
  if (size) await page.setViewportSize(size);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(screenshotDir, `${name}.png`) });
}
