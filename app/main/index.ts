import { app, BrowserWindow, Menu, shell } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configurePaths } from './paths';
import { log } from './log';
import { registerIpc } from './ipc';
import { registerDataHandlers } from './dataService';
import { registerSchwabHandlers } from './schwab';
import { registerUserHandlers } from './userDb';
import { watchWindow } from './watchdog';

const here = dirname(fileURLToPath(import.meta.url));

configurePaths();

// No default menu: Alt-key hotkeys (Alt+S sell, Alt+B buy...) must reach the game. A Mac always
// has a menu bar, so it gets a minimal one: the app menu (hide, quit), an Edit menu so copy and
// paste work in text fields, and the window menu. None of them uses a key the game needs.
if (process.platform === 'darwin') {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
      },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'togglefullscreen' }] },
    ]),
  );
} else {
  Menu.setApplicationMenu(null);
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const isTest = process.env.STG_E2E === '1';
  mainWindow = new BrowserWindow({
    width: isTest ? 1920 : 1600,
    height: isTest ? 1080 : 900,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    backgroundColor: '#0b0820',
    title: 'Spread Trading Game',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  watchWindow(mainWindow);
  // At most 20 console errors per 10 seconds reach the log: a burst (a chart redrawn every frame
  // with a bad number, say) must never tie the main process up writing the same line.
  let errWindow = 0;
  let errCount = 0;
  mainWindow.webContents.on('console-message', (event) => {
    if (event.level !== 'error') return;
    const now = Date.now();
    if (now - errWindow > 10_000) {
      if (errCount > 20) log('warn', `${errCount - 20} more screen console errors were not logged`);
      errWindow = now;
      errCount = 0;
    }
    if (++errCount <= 20) log('error', 'renderer console', event.message);
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(join(here, '../renderer/index.html'));
}

app.whenReady().then(() => {
  log('info', `app start v${app.getVersion()} electron ${process.versions.electron}`);
  registerIpc(() => mainWindow);
  registerDataHandlers();
  registerSchwabHandlers();
  registerUserHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

process.on('uncaughtException', (err) => log('error', 'uncaught exception', err));
