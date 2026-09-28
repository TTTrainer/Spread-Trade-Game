import { create } from 'zustand';
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from '../../shared/settings';
import type { DataStatus } from '../../shared/rpc';
import { bridge, hasBridge } from '../bridge';
import { setSfxVolume } from '../../audio/sfx';

export type Screen =
  | 'title'
  | 'sandboxSetup'
  | 'trading'
  | 'debrief'
  | 'drills'
  | 'stats'
  | 'settings'
  | 'credits'
  | 'career'
  | 'deskSelect'
  | 'run'
  | 'pad'
  | 'daily'
  | 'live'
  | 'contracts'
  | 'tutorial';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'warn';
}

interface AppState {
  screen: Screen;
  stack: Screen[];
  settings: Settings;
  settingsLoaded: boolean;
  data: DataStatus | null;
  toasts: Toast[];
  helpOpen: boolean;
  go: (s: Screen) => void;
  back: () => void;
  home: () => void;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: (s: Settings) => Settings) => void;
  refreshData: () => Promise<void>;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  setHelp: (open: boolean) => void;
}

let toastId = 0;

/** Push settings into CSS variables and the audio mixer. */
export function applySettings(s: Settings): void {
  const root = document.documentElement;
  root.style.setProperty('--crt-intensity', String(s.display.crt));
  root.style.setProperty('--ui-scale', String(s.display.uiScale));
  root.dataset.palette = s.display.colorblind ? 'colorblind' : 'default';
  root.dataset.reducedMotion = String(s.display.reducedMotion);
  root.dataset.theme = s.display.theme;
  setSfxVolume(s.audio.master, s.audio.sfx);
}

export const useApp = create<AppState>((set, get) => ({
  screen: 'title',
  stack: [],
  settings: DEFAULT_SETTINGS,
  settingsLoaded: false,
  data: null,
  toasts: [],
  helpOpen: false,
  go: (s) => set((st) => (st.screen === s ? st : { screen: s, stack: [...st.stack, st.screen].slice(-20) })),
  back: () =>
    set((st) => {
      const stack = st.stack.slice();
      const prev = stack.pop() ?? 'title';
      return { screen: prev, stack };
    }),
  home: () => set({ screen: 'title', stack: [] }),
  loadSettings: async () => {
    if (!hasBridge()) {
      set({ settingsLoaded: true });
      applySettings(get().settings);
      return;
    }
    const saved = await bridge().invoke('user.get', 'settings');
    const settings = mergeSettings(saved);
    applySettings(settings);
    set({ settings, settingsLoaded: true });
  },
  updateSettings: (patch) => {
    const settings = patch(get().settings);
    applySettings(settings);
    set({ settings });
    if (hasBridge()) void bridge().invoke('user.set', 'settings', settings);
  },
  refreshData: async () => {
    if (!hasBridge()) return;
    set({ data: await bridge().invoke('data.status') });
  },
  toast: (text, tone = 'info') => {
    const id = ++toastId;
    set((st) => ({ toasts: [...st.toasts.slice(-4), { id, text, tone }] }));
    setTimeout(() => get().dismissToast(id), 3800);
  },
  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
  setHelp: (open) => set({ helpOpen: open }),
}));
