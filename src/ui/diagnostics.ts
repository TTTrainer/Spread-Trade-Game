/**
 * A short trail of what the screen just did (actions, the clock, dialogue, screens, errors),
 * sent to the main process every second. If the window ever freezes, game.log holds the last
 * steps before it, and a stall long enough to notice is logged when it ends.
 */

import type { ScreenWhere } from '../shared/rpc';
import { bridge, hasBridge } from './bridge';
import { useApp } from './store/app';
import { useRun, type RunSlot } from './store/run';
import { useTrading } from './store/trading';
import { crumb, recentTrail } from './trail';

const beat = () =>
  void bridge().invoke('system.heartbeat', {
    trail: recentTrail(),
    visible: document.visibilityState === 'visible',
    where: whereNow(),
  });

/** Where the screen is: a restarted screen goes straight back there (runs save after every move). */
function whereNow(): ScreenWhere {
  const screen = useApp.getState().screen;
  const run = useRun.getState();
  return { screen, slot: screen === 'run' && run.engine ? run.slot : null };
}

/**
 * Restart the screen after an error it can't draw past. The main process logs it with the trail
 * and reloads; the new screen comes back to the same run.
 */
export function restartScreen(why: string): void {
  if (!hasBridge()) {
    location.reload();
    return;
  }
  void bridge().invoke('system.heartbeat', {
    trail: recentTrail(),
    visible: true,
    where: whereNow(),
  });
  void bridge().invoke('system.reloadScreen', why);
}

export function startDiagnostics(): void {
  if (!hasBridge()) return;
  useApp.subscribe((s, prev) => {
    if (s.screen !== prev.screen) crumb(`screen ${s.screen}`);
    const t = s.toasts.at(-1);
    if (t && t !== prev.toasts.at(-1)) crumb(`toast ${t.text.slice(0, 60)}`);
  });
  useTrading.subscribe((s, prev) => {
    if (s.ff !== prev.ff) crumb(`clock ${s.ff} day ${s.session?.dayIndex ?? '-'}`);
    if (!!s.dayAnim !== !!prev.dayAnim) crumb(s.dayAnim ? `day plays ${s.dayAnim.ms}ms` : 'day shown');
    if (!!s.recap !== !!prev.recap) crumb(s.recap ? 'recap up' : 'recap down');
    if (s.selectedCardId !== prev.selectedCardId) crumb(`card ${s.selectedCardId}`);
    if (s.dragging !== prev.dragging) crumb(`drag ${s.dragging}`);
  });
  useRun.subscribe((s, prev) => {
    if (s.speech && s.speech !== prev.speech)
      crumb(`says ${s.speech.line.who}: ${s.speech.line.text.slice(0, 40)}`);
    const phase = s.engine?.state.phase;
    if (phase !== prev.engine?.state.phase) crumb(`phase ${phase}`);
  });
  window.addEventListener('error', (e) => {
    crumb(`error ${e.message}`);
    void bridge().invoke('system.log', 'error', 'screen error', {
      message: e.message,
      stack: e.error instanceof Error ? e.error.stack : undefined,
      trail: recentTrail(),
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    crumb(`rejection ${String(e.reason).slice(0, 80)}`);
  });
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const lag = now - last - 1000;
    last = now;
    if (lag > 1500) {
      crumb(`stall ${Math.round(lag)}ms`);
      void bridge().invoke('system.log', 'warn', 'screen stalled', {
        ms: Math.round(lag),
        trail: recentTrail(),
      });
    }
    beat();
  }, 1000);
  // Hidden windows slow their timers: say so at once, so the watchdog doesn't mistake it for a freeze.
  document.addEventListener('visibilitychange', beat);
  // The screen was restarted (stuck, or an error it couldn't draw past): go back where it was.
  void bridge()
    .invoke('system.recovered')
    .then(async (w) => {
      if (!w) return;
      const back = w.screen === 'run' && w.slot ? await returnToRun(w.slot) : false;
      setTimeout(
        () =>
          useApp
            .getState()
            .toast(
              back
                ? "The screen stopped responding and restarted. You're back in your run: it saves after every move."
                : 'The screen stopped responding and was restarted. Your run was autosaved: continue it from Career. game.log has the details.',
              'warn',
            ),
        1200,
      );
    });
}

async function returnToRun(slot: string): Promise<boolean> {
  // Settings first: the run screen draws with them.
  for (let i = 0; i < 50 && !useApp.getState().settingsLoaded; i++)
    await new Promise((r) => setTimeout(r, 100));
  try {
    const ok = await useRun.getState().resume(slot as RunSlot);
    if (ok) useApp.getState().go('run');
    return ok;
  } catch {
    return false;
  }
}
