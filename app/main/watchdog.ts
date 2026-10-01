/**
 * Keeps a stuck screen from costing a run, and leaves a trail in game.log when it happens.
 *
 * - The game screen sends a heartbeat every second with its recent actions (a short breadcrumb
 *   trail), so even a hard freeze leaves a record of what it was doing.
 * - A visible window that misses heartbeats for 12 seconds is stuck: the log records it with that
 *   trail and any market-data calls in flight, and the screen reloads. Every action autosaves, so
 *   the run picks up where it was, and the screen says what happened. (Electron's own
 *   'unresponsive' signal takes about 30 seconds; it is logged too.) A hidden or minimized window
 *   slows its timers on purpose, so it never counts as stuck.
 * - The main process watches its own event loop too. On a Mac a stalled main process freezes the
 *   whole window, so a stall is logged with the calls it was serving.
 */
import type { BrowserWindow } from 'electron';
import { log } from './log';

const STUCK_AFTER_MS = 12_000;

let trail: string[] = [];
let recovered = false;
let lastBeat = { at: 0, visible: false };
const inflight = new Map<number, { what: string; since: number }>();
let callId = 0;

/** A heartbeat from the screen: its trail, and whether the page is visible (timers run freely). */
export function heartbeat(beat: { trail: string[]; visible: boolean }): void {
  trail = beat.trail.slice(-40);
  lastBeat = { at: Date.now(), visible: beat.visible };
}

/** True once after the window was reloaded by the watchdog (the screen shows a notice). */
export function takeRecovered(): boolean {
  const r = recovered;
  recovered = false;
  return r;
}

/** Track one IPC call so a stall can name it. Returns the function that ends the tracking. */
export function trackCall(channel: string, args: unknown[]): () => void {
  const id = ++callId;
  const what = channel === 'market.call' ? `market.${String(args[0])}` : channel;
  const since = Date.now();
  inflight.set(id, { what, since });
  return () => {
    inflight.delete(id);
    const ms = Date.now() - since;
    if (ms > 1500) log('warn', `slow call ${what}`, { ms });
  };
}

function inflightNow(): string[] {
  const now = Date.now();
  return [...inflight.values()].map((c) => `${c.what} (${now - c.since} ms)`);
}

export function watchWindow(win: BrowserWindow): void {
  const wc = win.webContents;
  let reloading = false;
  const reloadNow = () => {
    if (!win.isDestroyed()) void wc.reload();
  };
  const reload = (why: string) => {
    if (reloading || win.isDestroyed()) return;
    reloading = true;
    log('error', `${why}: reloading the screen (the run is autosaved)`, { trail, inflight: inflightNow() });
    recovered = true;
    lastBeat = { at: 0, visible: false };
    // End the stuck screen process; the reload happens once it's gone (or in 3 s regardless).
    const fallback = setTimeout(reloadNow, 3000);
    wc.once('render-process-gone', () => {
      clearTimeout(fallback);
      setTimeout(reloadNow, 100);
    });
    try {
      wc.forcefullyCrashRenderer();
    } catch {
      // Already gone.
    }
  };
  wc.on('did-finish-load', () => {
    reloading = false;
  });
  wc.on('unresponsive', () => log('error', 'window stopped responding', { trail, inflight: inflightNow() }));
  wc.on('responsive', () => log('info', 'window responding again'));
  wc.on('render-process-gone', (_e, details) => {
    log('error', 'screen process gone', { details, trail });
    if (details.reason === 'clean-exit' || win.isDestroyed() || reloading) return;
    reloading = true;
    recovered = true;
    setTimeout(reloadNow, 100);
  });

  // Heartbeats, and the main process's own event loop: a timer that fires late means it was blocked.
  let last = Date.now();
  const tick = setInterval(() => {
    const now = Date.now();
    const lag = now - last - 1000;
    last = now;
    if (lag > 1500) log('warn', 'main process stalled', { ms: lag, inflight: inflightNow(), trail });
    const shown = !win.isDestroyed() && win.isVisible() && !win.isMinimized();
    if (shown && lastBeat.visible && lastBeat.at > 0 && now - lastBeat.at > STUCK_AFTER_MS)
      reload(`screen stuck for ${Math.round((now - lastBeat.at) / 1000)} s`);
  }, 1000);
  win.on('closed', () => clearInterval(tick));
}
