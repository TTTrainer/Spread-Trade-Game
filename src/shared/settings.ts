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
  | 'select9'
  | 'nextDay'
  | 'slower'
  | 'faster'
  | 'strikeUp'
  | 'strikeDown'
  | 'expNext'
  | 'expPrev'
  | 'qtyUp'
  | 'qtyDown'
  | 'presetWeekly'
  | 'presetSwing'
  | 'presetMine'
  | 'chain'
  | 'devPanel';

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
  nextDay: 'N',
  slower: ',',
  faster: '.',
  strikeUp: 'ArrowUp',
  strikeDown: 'ArrowDown',
  expNext: 'ArrowRight',
  expPrev: 'ArrowLeft',
  qtyUp: '=',
  qtyDown: '-',
  presetWeekly: 'W',
  presetSwing: 'M',
  presetMine: 'Y',
  chain: 'Ctrl+5',
  devPanel: 'Ctrl+Shift+D',
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
  nextDay: 'Play the next day',
  slower: 'Slower clock',
  faster: 'Faster clock',
  strikeUp: 'Short strike up one',
  strikeDown: 'Short strike down one',
  expNext: 'Later expiration',
  expPrev: 'Earlier expiration',
  qtyUp: 'More conviction (size)',
  qtyDown: 'Less conviction (size)',
  presetWeekly: 'Setup: weekly',
  presetSwing: 'Setup: 30-45 day swing',
  presetMine: 'Setup: my saved setup',
  chain: 'Option chain (full screen)',
  devPanel: 'Developer panel (developer mode)',
};

export type DayPace = 'step' | '1' | '2' | '4';

export interface SavedSetup {
  structureId: string;
  /** Aim for this many days to expiration (the closest listed date wins). */
  dte: number;
  delta: number;
  /** Width in strike steps. */
  width: number;
  /** Risk per trade as a share of equity (older saves). */
  riskPct: number;
  /** Conviction (0.5-0.9): the confidence behind the call and the share of the risk cap used. */
  conviction?: number;
  targetPct: number;
  stopMult: number;
}

export interface Settings {
  /** Bumped when defaults change in a way saved settings should pick up. */
  version: number;
  game: {
    startingCapitalCents: number;
    /**
     * Starting capital for Income desk runs. Cash-secured puts and covered calls tie up the whole
     * share price, so a small account can barely open one; the game asks before each Income run.
     */
    incomeCapitalCents: number;
    shortDelta: number;
    bucketMode: 'em' | 'fixed';
    /** Seconds per trading day at 1x (the candle plays for most of it). */
    ffSecondsPerDay: number;
    /** How the clock runs: one day per press, or continuously at 1x, 2x or 4x. */
    dayPace: DayPace;
    /** Pause the clock (no pop-up) the first time a day trades near or through a short strike. */
    pauseOnTest: boolean;
    /** The player's own saved builder setup (the MY SETUP preset). */
    mySetup: SavedSetup | null;
    /** Calling a direction switches to a structure that fits it (up: bull put, down: bear call). */
    callPicksStructure: boolean;
    /** Your trading plan, set once: take profit at this share of max profit... */
    planTargetPct: number;
    /** ...and stop a credit spread when the loss reaches this many times the credit. */
    planStopMult: number;
    pause: Record<DecisionKind, boolean>;
    pureMarket: boolean;
    tutorialDone: boolean;
    /** Structures whose first-use coach card has been seen. */
    seenStructures: string[];
    /** Where the tutorial's lessons are (null: from the top). */
    tutorialProgress: { idx: number; seen: string[]; skipped: boolean } | null;
    /** Show a confirm box before each order (off: orders go out on Sell/Buy). */
    confirmOrders: boolean;
    /** Developer mode: the DEV panel (unlocks, cash and stress levers, playtest notes). */
    devMode: boolean;
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
    theme: 'indigo' | 'amber' | 'phosphor' | 'vapor';
    crtStyle: 'scanlines' | 'clean' | 'aperture' | 'rolling';
    cardBack: string;
  };
  audio: { master: number; music: number; sfx: number; style: 'synthwave' | 'darkwave' | 'chiptune' };
  hotkeys: Record<HotkeyAction, string>;
  data: { gameDbPath: string | null };
}

export const SETTINGS_VERSION = 5;

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  game: {
    startingCapitalCents: 500_000,
    incomeCapitalCents: 5_000_000,
    shortDelta: 0.3,
    bucketMode: 'em',
    ffSecondsPerDay: 5.6,
    dayPace: 'step',
    pauseOnTest: true,
    mySetup: null,
    callPicksStructure: true,
    planTargetPct: 0.5,
    planStopMult: 2,
    // Only the moments that need a real decision stop the clock. A hit target waits for you to
    // take the profit (1.6: closing is the player's call); a touched short strike and 21 DTE
    // show up as notices.
    pause: {
      target_hit: true,
      stop_hit: true,
      short_touched: false,
      dte21: false,
      earnings_tomorrow: true,
      exdiv_itm_call: true,
      pin_risk: true,
      assigned_shares: true,
    },
    pureMarket: false,
    tutorialDone: false,
    seenStructures: [],
    tutorialProgress: null,
    confirmOrders: false,
    devMode: false,
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
  display: {
    crt: 0.55,
    shake: true,
    reducedMotion: false,
    colorblind: false,
    uiScale: 1,
    theme: 'indigo',
    crtStyle: 'scanlines',
    cardBack: 'standard',
  },
  audio: { master: 0.8, music: 0.5, sfx: 0.8, style: 'synthwave' },
  hotkeys: { ...DEFAULT_HOTKEYS },
  data: { gameDbPath: null },
};

/** Deep-merge saved settings over defaults so new settings get sane values after updates. */
export function mergeSettings(saved: unknown): Settings {
  const s = (saved ?? {}) as Partial<Settings>;
  // Version 2 (playtest feedback): fewer clock stops. Older saves take the new pause defaults.
  const old = (s.version ?? 1) < 2;
  // Version 3: days play out as forming candles, so the old fast default (0.35 s) became 1.4 s.
  // Version 4 (playtest 3): day by day is the default, and 1x runs at a quarter of the v3 speed.
  const ver = s.version ?? 1;
  // Version 5 (playtest 5): a hit profit target pauses so taking the profit is the player's move.
  const v5 = ver < 5 ? { target_hit: true } : {};
  const oldSpeed = s.game?.ffSecondsPerDay;
  const v3 =
    ver < 4
      ? {
          dayPace: 'step' as const,
          ...(oldSpeed === undefined || oldSpeed === 0.35 || oldSpeed === 1.4
            ? { ffSecondsPerDay: 5.6 }
            : {}),
        }
      : {};
  return {
    version: SETTINGS_VERSION,
    game: {
      ...DEFAULT_SETTINGS.game,
      ...s.game,
      ...v3,
      pause: old
        ? { ...DEFAULT_SETTINGS.game.pause }
        : { ...DEFAULT_SETTINGS.game.pause, ...s.game?.pause, ...v5 },
    },
    realism: { ...DEFAULT_SETTINGS.realism, ...s.realism },
    blind: { ...DEFAULT_SETTINGS.blind, ...s.blind },
    display: { ...DEFAULT_SETTINGS.display, ...s.display },
    audio: { ...DEFAULT_SETTINGS.audio, ...s.audio },
    hotkeys: { ...DEFAULT_HOTKEYS, ...s.hotkeys },
    data: { ...DEFAULT_SETTINGS.data, ...s.data },
  };
}
