import { app, type BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EventChannel, EventMap, RpcChannel, RpcMap } from '../../src/shared/rpc';
import { defaultGameDbPath, logDir, userDataDir } from './paths';
import { log } from './log';

type Handlers = {
  [C in RpcChannel]: (
    ...args: Parameters<RpcMap[C]>
  ) => ReturnType<RpcMap[C]> | Promise<ReturnType<RpcMap[C]>>;
};

let getWindow: () => BrowserWindow | null = () => null;

export function emit<E extends EventChannel>(channel: E, payload: EventMap[E]): void {
  getWindow()?.webContents.send(channel, payload);
}

const extraHandlers: Partial<Handlers> = {};

/** Later modules (market data, saves, data pipeline) add their channels here. */
export function addHandlers(h: Partial<Handlers>): void {
  Object.assign(extraHandlers, h);
}

function systemHandlers(): Pick<Handlers, `system.${string}` & RpcChannel> {
  return {
    'system.info': () => ({
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      userDataDir: userDataDir(),
      gameDbPath: defaultGameDbPath(),
      logDir: logDir(),
      isE2E: process.env.STG_E2E === '1',
    }),
    'system.quit': () => app.quit(),
    'system.toggleFullscreen': () => {
      const w = getWindow();
      if (!w) return false;
      w.setFullScreen(!w.isFullScreen());
      return w.isFullScreen();
    },
    'system.openPath': (path: string) => {
      void shell.openPath(path);
    },
    'system.screenshot': async (name: string) => {
      const w = getWindow();
      if (!w) return null;
      const dir = join(userDataDir(), 'playtest');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${name.replace(/[^\w.-]+/g, '_')}.png`);
      const img = await w.webContents.capturePage();
      writeFileSync(file, img.toPNG());
      return file;
    },
    'system.saveTextFile': (suggestedName: string, content: string) => {
      const w = getWindow();
      // In E2E there is no human to click a dialog, so write straight into the test folder.
      if (process.env.STG_E2E === '1' && process.env.STG_EXPORT_DIR) {
        const target = `${process.env.STG_EXPORT_DIR}/${suggestedName}`;
        writeFileSync(target, content, 'utf8');
        return target;
      }
      if (!w) return null;
      const result = dialog.showSaveDialogSync(w, { defaultPath: suggestedName });
      if (!result) return null;
      writeFileSync(result, content, 'utf8');
      return result;
    },
  };
}

export function registerIpc(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter;
  const base = systemHandlers();
  ipcMain.handle('rpc', async (_event, channel: RpcChannel, ...args: unknown[]) => {
    const handler = (extraHandlers[channel] ?? (base as Partial<Handlers>)[channel]) as
      ((...a: unknown[]) => unknown) | undefined;
    if (!handler) throw new Error(`Unknown channel ${channel}`);
    try {
      return await handler(...args);
    } catch (err) {
      log('error', `rpc ${channel} failed`, err);
      throw err;
    }
  });
}
