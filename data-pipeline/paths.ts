import { homedir } from 'node:os';
import { join } from 'node:path';

/** Default locations outside Electron (CLI scripts). Mirrors app/main/paths.ts. */
export function defaultPaths(): { gameDb: string; doltRoot: string; userData: string } {
  const appData =
    process.env.APPDATA ??
    (process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : join(homedir(), '.config'));
  const userData = process.env.STG_USER_DATA ?? join(appData, 'SpreadTradingGame');
  return {
    userData,
    gameDb: process.env.STG_GAME_DB ?? join(userData, 'data', 'game.db'),
    doltRoot: process.env.STG_DOLT_ROOT ?? join(homedir(), 'SpreadTradingGameData'),
  };
}
