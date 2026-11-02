import { app } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Where everything lives on disk. Saves and the built market database go under
 * %APPDATA%\SpreadTradingGame; Dolt clones go under %USERPROFILE%\SpreadTradingGameData
 * because they are big and should survive an uninstall.
 * STG_USER_DATA lets tests point the whole app at a throwaway folder.
 */
export function configurePaths(): void {
  const override = process.env.STG_USER_DATA;
  const userData = override ?? join(app.getPath('appData'), 'SpreadTradingGame');
  mkdirSync(userData, { recursive: true });
  app.setPath('userData', userData);
}

export function userDataDir(): string {
  return app.getPath('userData');
}

export function defaultGameDbPath(): string {
  return join(userDataDir(), 'data', 'game.db');
}

/** schwab.db: what PULL FROM SCHWAB saves, kept apart from game.db so rebuilding never loses it. */
export function schwabStorePath(): string {
  return join(userDataDir(), 'data', 'schwab.db');
}

export function userDbPath(): string {
  return join(userDataDir(), 'user.db');
}

export function logDir(): string {
  const dir = join(userDataDir(), 'logs');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function doltRootDir(): string {
  return process.env.STG_DOLT_ROOT ?? join(homedir(), 'SpreadTradingGameData');
}
