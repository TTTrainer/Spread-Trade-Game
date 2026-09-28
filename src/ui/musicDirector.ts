/**
 * Tells the music what is happening: which scene we're in and how intense it is. Intensity mixes
 * realized volatility on the running cards, stress, and meter pressure (how far the meter is from
 * the target as the round goes on). Read-only: it never touches game state.
 */

import { useEffect } from 'react';
import type { Scene } from '../audio/composer';
import { music } from '../audio/music';
import { useApp, type Screen } from './store/app';
import { useRun } from './store/run';
import { useTrading } from './store/trading';

const MENU: Screen[] = [
  'career',
  'daily',
  'drills',
  'stats',
  'settings',
  'credits',
  'pad',
  'contracts',
  'live',
  'sandboxSetup',
  'achievements',
];

/** Average absolute daily move of the running cards over the last few days, scaled so ~3% is loud. */
function realizedVol(): number {
  const s = useTrading.getState().session;
  if (!s) return 0;
  const ids = s.runningCardIds();
  if (!ids.length) return 0;
  let sum = 0;
  let n = 0;
  for (const id of ids) {
    const bars = s.view(id).bars();
    for (let i = Math.max(1, bars.length - 5); i < bars.length; i++) {
      sum += Math.abs(bars[i].close / bars[i - 1].close - 1);
      n++;
    }
  }
  return n ? Math.min(1, sum / n / 0.03) : 0;
}

export function currentScene(): { scene: Scene; seed: string; intensity: number } {
  const screen = useApp.getState().screen;
  const t = useTrading.getState();
  const ffScene: Scene = t.ff === 'running' || t.ff === 'decision' ? 'ff' : 'trade';
  if (screen === 'title') return { scene: 'title', seed: 'title', intensity: 0 };
  if (MENU.includes(screen)) return { scene: 'menu', seed: screen, intensity: 0 };
  if (screen === 'run') {
    const e = useRun.getState().engine;
    if (!e) return { scene: 'menu', seed: 'run', intensity: 0 };
    const st = e.state;
    const seed = `${st.config.seed}:q${st.quarter}r${st.roundIndex}`;
    const stress = st.stress / 100;
    switch (st.phase) {
      case 'tally':
        return { scene: 'tally', seed, intensity: 0.3 };
      case 'shop':
        return { scene: 'shop', seed, intensity: 0 };
      case 'review_intro':
        return { scene: 'review', seed, intensity: 0.3 + stress * 0.4 };
      case 'victory':
        return { scene: 'victory', seed, intensity: 1 };
      case 'defeat':
        return { scene: 'defeat', seed, intensity: 0 };
      default: {
        const r = st.round;
        const ffOn = ffScene === 'ff';
        const pressure =
          r.target > 0 && r.clockStarted ? Math.max(0, 1 - Math.max(0, r.meter) / r.target) : 0;
        const intensity = (ffOn ? 0.25 + 0.35 * realizedVol() : 0.1) + 0.25 * stress + 0.2 * pressure;
        return { scene: r.reviewId ? 'review' : ffScene, seed, intensity };
      }
    }
  }
  // Sandbox, Live and Contracts trading screens.
  return { scene: ffScene, seed: screen, intensity: ffScene === 'ff' ? 0.25 + 0.5 * realizedVol() : 0.1 };
}

export function useMusicDirector(): void {
  const master = useApp((s) => s.settings.audio.master);
  const vol = useApp((s) => s.settings.audio.music);
  const style = useApp((s) => s.settings.audio.style);

  useEffect(() => {
    music.setVolume(master * vol);
  }, [master, vol]);
  useEffect(() => {
    music.setStyle(style);
  }, [style]);

  useEffect(() => {
    // Browsers only start audio after a click or key press.
    const kick = () => {
      const a = useApp.getState().settings.audio;
      if (a.master * a.music > 0.001) void music.start();
    };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
    const timer = window.setInterval(() => {
      const c = currentScene();
      music.setScene(c.scene, c.seed);
      music.setIntensity(c.intensity);
    }, 700);
    return () => {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
      window.clearInterval(timer);
    };
  }, []);
}
