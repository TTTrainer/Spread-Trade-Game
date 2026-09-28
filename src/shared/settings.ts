import type { DecisionKind } from '../engine/lifecycle/types';

export type HotkeyAction =
  | 'positions'
  | 'builder'
  | 'analyze'
  | 'lineup'
  | 'chartFocus'
  | 'help'
  | 'home'
  | 'back'
  | 'nextPanel'
  | 'prevPanel'
  | 'studies'
  | 'timeframe'
  | 'zoomIn'
  | 'zoomOut'
  | 'settings'
  | 'buy'
  | 'sell'
  | 'flatten'
  | 'reverse'
  | 'autoSend'
  | 'ladderIn'
  | 'ladderOut'
  | 'ladderReset'
  | 'bucket1'
  | 'bucket2'
  | 'bucket3'
  | 'bucket4'
  | 'bucket5'
  | 'conf1'
  | 'conf2'
  | 'conf3'
  | 'conf4'
  | 'conf5'
  | 'playPause'
  | 'reroll'
  | 'skip'
  | 'confirm'
  | 'select1'
  | 'select2'
  | 'select3'
  | 'select4'
  | 'select5'
  | 'select6'
  | 'select7'
  | 'select8'
  | 'select9';

/** thinkorswim defaults (plus game-only keys). Remappable in Settings. */
export const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  positions: 'Ctrl+1',
  builder: 'Ctrl+2',
  analyze: 'Ctrl+3',
  lineup: 'Ctrl+4',
  chartFocus: 'Ctrl+6',
  help: 'Ctrl+8',
  home: 'Ctrl+H',
  back: 'Ctrl+`',
  nextPanel: 'Ctrl+Tab',
  prevPanel: 'Ctrl+Shift+Tab',
  studies: 'Ctrl+E',
  timeframe: 'Ctrl+T',
  zoomIn: 'Ctrl+=',
  zoomOut: 'Ctrl+-',
  settings: 'Ctrl+S',
  buy: 'Alt+B',
  sell: 'Alt+S',
  flatten: 'Alt+F',
  reverse: 'Alt+R',
  autoSend: 'Alt+A',
  ladderIn: 'Alt+[',
  ladderOut: 'Alt+]',
  ladderReset: 'Alt+\\',
  bucket1: '1',
  bucket2: '2',
  bucket3: '3',
  bucket4: '4',
  bucket5: '5',
  conf1: 'Shift+1',
  conf2: 'Shift+2',
  conf3: 'Shift+3',
  conf4: 'Shift+4',
  conf5: 'Shift+5',
  playPause: 'Space',
  reroll: 'R',
  skip: 'K',
  confirm: 'Enter',
  select1: 'Alt+1',
  select2: 'Alt+2',
  select3: 'Alt+3',
  select4: 'Alt+4',
  select5: 'Alt+5',
  select6: 'Alt+6',
  select7: 'Alt+7',
  select8: 'Alt+8',
  select9: 'Alt+9',
};

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  positions: 'Positions (Monitor)',
  builder: 'Trade builder',
  analyze: 'Analyze / what-if',
  lineup: 'Lineup (Scan)',
  chartFocus: 'Chart focus',
  help: 'Help / glossary',
  home: 'Home',
  back: 'Back',
  nextPanel: 'Next panel',
  prevPanel: 'Previous panel',
  studies: 'Edit studies',
  timeframe: 'Timeframe',
  zoomIn: 'Chart zoom in',
  zoomOut: 'Chart zoom out',
  settings: 'Settings',
  buy: 'Buy (debit / long)',
  sell: 'Sell (credit)',
  flatten: 'Flatten (close selected)',
  reverse: 'Reverse structure',
  autoSend: 'Auto-send on/off',
  ladderIn: 'Ladder zoom in',
  ladderOut: 'Ladder zoom out',
  ladderReset: 'Ladder reset',
  bucket1: 'Call: down big',
  bucket2: 'Call: down',
  bucket3: 'Call: flat',
  bucket4: 'Call: up',
  bucket5: 'Call: up big',
  conf1: 'Confidence 50%',
  conf2: 'Confidence 60%',
  conf3: 'Confidence 70%',
  conf4: 'Confidence 80%',
  conf5: 'Confidence 90%',
  playPause: 'Play / pause fast-forward',
  reroll: 'Reroll lineup',
  skip: 'Skip round',
  confirm: 'Confirm',
  select1: 'Select card/position 1',
  select2: 'Select card/position 2',
  select3: 'Select card/position 3',
  select4: 'Select card/position 4',
  select5: 'Select card/position 5',
  select6: 'Select card/position 6',
  select7: 'Select card/position 7',
  select8: 'Select card/position 8',
  select9: 'Select card/position 9',
};

export interface Settings {
  game: {
    startingCapitalCents: number;
    shortDelta: number;
    bucketMode: 'em' | 'fixed';
    ffSecondsPerDay: number;
    pause: Record<DecisionKind, boolean>;
    pureMarket: boolean;
    tutorialDone: boolean;
  };
  realism: {
    bidAsk: boolean;
    earnings: boolean;
    earlyAssignment: boolean;
    expirationMechanics: boolean;
    pdt: boolean;
    fees: boolean;
    liquidityLimits: boolean;
    taxes: boolean;
    approvalLevels: boolean;
  };
  blind: { rescale: boolean; flipDrills: boolean; synthetic: boolean };
  display: {
    crt: number;
    shake: boolean;
    reducedMotion: boolean;
    colorblind: boolean;
    uiScale: number;
    theme: 'indigo' | 'amber' | 'phosphor';
  };
  audio: { master: number; music: number; sfx: number; style: 'synthwave' | 'darkwave' | 'chiptune' };
  hotkeys: Record<HotkeyAction, string>;
  data: { gameDbPath: string | null };
}

export const DEFAULT_SETTINGS: Settings = {
  game: {
    startingCapitalCents: 500_000,
    shortDelta: 0.3,
    bucketMode: 'em',
    ffSecondsPerDay: 0.35,
    pause: {
      target_hit: true,
      stop_hit: true,
      short_touched: true,
      dte21: true,
      earnings_tomorrow: true,
      exdiv_itm_call: true,
      pin_risk: true,
      assigned_shares: true,
    },
    pureMarket: false,
    tutorialDone: false,
  },
  realism: {
    bidAsk: true,
    earnings: true,
    earlyAssignment: true,
    expirationMechanics: true,
    pdt: true,
    fees: false,
    liquidityLimits: false,
    taxes: false,
    approvalLevels: false,
  },
  blind: { rescale: true, flipDrills: true, synthetic: false },
  display: { crt: 0.55, shake: true, reducedMotion: false, colorblind: false, uiScale: 1, theme: 'indigo' },
  audio: { master: 0.8, music: 0.5, sfx: 0.8, style: 'synthwave' },
  hotkeys: { ...DEFAULT_HOTKEYS },
  data: { gameDbPath: null },
};

/** Deep-merge saved settings over defaults so new settings get sane values after updates. */
export function mergeSettings(saved: unknown): Settings {
  const s = (saved ?? {}) as Partial<Settings>;
  return {
    game: {
      ...DEFAULT_SETTINGS.game,
      ...s.game,
      pause: { ...DEFAULT_SETTINGS.game.pause, ...s.game?.pause },
    },
    realism: { ...DEFAULT_SETTINGS.realism, ...s.realism },
    blind: { ...DEFAULT_SETTINGS.blind, ...s.blind },
    display: { ...DEFAULT_SETTINGS.display, ...s.display },
    audio: { ...DEFAULT_SETTINGS.audio, ...s.audio },
    hotkeys: { ...DEFAULT_HOTKEYS, ...s.hotkeys },
    data: { ...DEFAULT_SETTINGS.data, ...s.data },
  };
}
