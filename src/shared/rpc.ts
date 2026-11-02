/**
 * The typed contract between the renderer and the Electron main process.
 * Every channel name maps to a function signature; the preload exposes a single
 * generic `invoke`, and both sides are checked against this map.
 */

/** Where the screen was (sent with each heartbeat), so a restarted screen can return there. */
export interface ScreenWhere {
  screen: string;
  /** The save slot of the run on screen (career, daily, tutorial), if any. */
  slot: string | null;
}

export interface SystemInfo {
  version: string;
  electron: string;
  platform: string;
  userDataDir: string;
  gameDbPath: string;
  logDir: string;
  isE2E: boolean;
}

export interface DataStatus {
  kind: 'real' | 'synthetic' | 'mixed';
  usingBuiltDb: boolean;
  gameDbPath: string;
  gameDbExists: boolean;
  lastDate: string;
  symbols: number;
  notes: string[];
  busy: boolean;
  /** Built from schwab.db alone (option chains modeled except the closes Schwab was pulled after). */
  fromSchwab?: boolean;
  /** The Options DB release game.db was downloaded from (null when built on this computer). */
  downloaded?: string | null;
}

export interface DataReleaseInfo {
  version: string;
  firstDate: string;
  lastDate: string;
  size: number;
}

/** The Options DB's published game data, against what's on this computer. */
export interface DataUpdateStatus {
  /** The latest release, once the game has reached the Options DB this session. */
  remote: DataReleaseInfo | null;
  /** The release game.db was downloaded from (null when built here or absent). */
  installed: DataReleaseInfo | null;
  /** Downloaded in the background, loading at the next launch (or LOAD NOW). */
  staged: DataReleaseInfo | null;
  plan: 'install' | 'update' | 'keep' | 'offline' | 'unknown';
  message: string;
  checkedAt: string | null;
  busy: boolean;
}

export interface DataBuildRequest {
  /**
   * schwabPull saves Schwab's newest prices and closing chains into schwab.db; schwabBuild makes
   * game.db from schwab.db (adding the newest days to DoltHub data, or building from it alone).
   */
  mode: 'synthetic' | 'real' | 'sync' | 'schwabPull' | 'schwabBuild';
  allowDownload: boolean;
  confirmLowDisk: boolean;
}

export interface DataBuildResult {
  ok: boolean;
  message: string;
  needsDiskConfirm?: boolean;
}

/** Settings for the read-only Schwab market-data connection (an empty secret keeps the saved one). */
export interface SchwabSettings {
  appKey: string;
  appSecret: string;
  callbackUrl: string;
}

export interface SchwabStatus {
  /** App Key and App Secret saved. */
  configured: boolean;
  /** Logged in, with a login that hasn't expired. */
  connected: boolean;
  appKeyHint: string | null;
  callbackUrl: string;
  /** When Schwab asks for the login again (every 7 days). */
  loginExpiresAt: number | null;
  /** Keys and tokens are encrypted by the operating system's key store. */
  encrypted: boolean;
}

/** What schwab.db holds (null fields before the first pull). */
export interface SchwabStoreStatus {
  path: string;
  exists: boolean;
  symbols: number;
  firstDate: string | null;
  lastDate: string | null;
  chainDays: number;
  chains: number;
  lastPullAt: string | null;
}

import type { DrillRow, RunRow, SaveSlot, TradeRow } from './userData';
import type { BuilderLoadResult } from '../../data-pipeline/schwab/builderLoad';

/** A ticker the Trade Builder offers, and how fresh its saved data is. */
export interface BuilderListItem {
  symbol: string;
  name: string;
  sector: string;
  group: 'etf' | 'stock' | 'index' | 'sim';
  /** One of the Trade Builder's added tickers. */
  isNew: boolean;
  savedThrough: string | null;
}

export interface BuilderList {
  /** Schwab is connected, so tickers load live. */
  schwab: boolean;
  dataKind: 'real' | 'synthetic' | 'mixed' | null;
  tickers: BuilderListItem[];
}

export type { BuilderLoadResult };

export interface RpcMap {
  'user.get': (key: string) => unknown;
  'user.set': (key: string, value: unknown) => void;
  'user.save': (slot: SaveSlot) => void;
  'user.load': (slot: string) => SaveSlot | null;
  'user.deleteSave': (slot: string) => void;
  'user.listSaves': () => Omit<SaveSlot, 'data'>[];
  'user.recordTrade': (t: TradeRow) => void;
  'user.trades': () => TradeRow[];
  'user.recordDrill': (d: DrillRow) => void;
  'user.drills': () => DrillRow[];
  'user.recordRun': (r: RunRow) => void;
  'user.runs': () => RunRow[];
  /** Market data: `asOf` is the caller's simulated date; the main process refuses anything later. */
  'market.call': (method: string, args: unknown[], asOf: string | null) => unknown;
  'data.status': () => DataStatus;
  'data.build': (req: DataBuildRequest) => DataBuildResult;
  /** The Options DB's latest release against this computer's data (`refresh` asks it again). */
  'data.updateStatus': (refresh?: boolean) => DataUpdateStatus;
  /** Download the latest published game.db and load it now (no DoltHub, Schwab or saved data needed). */
  'data.download': () => DataBuildResult;
  /** Load a release downloaded in the background without waiting for the next launch. */
  'data.applyUpdate': () => DataBuildResult;
  'data.report': () => string;
  /** Read-only Schwab market data. Keys and tokens stay in the user-data folder, encrypted. */
  'schwab.status': () => SchwabStatus;
  'schwab.save': (s: SchwabSettings) => SchwabStatus;
  /** Opens Schwab's login page in the browser; returns its address. */
  'schwab.login': () => string;
  /** The address the browser landed on after the login (it carries the one-time code). */
  'schwab.finish': (pastedUrl: string) => SchwabStatus;
  /** Log out (forget = also remove the saved App Key and Secret). */
  'schwab.disconnect': (forget: boolean) => SchwabStatus;
  /** What PULL FROM SCHWAB has saved in schwab.db. */
  'schwab.store': () => SchwabStoreStatus;
  /** The Trade Builder: its tickers, and one ticker's data (Schwab live first, read-only). */
  'builder.list': () => BuilderList;
  'builder.load': (symbol: string) => BuilderLoadResult;
  'system.info': () => SystemInfo;
  'system.quit': () => void;
  /** A line in game.log from the screen (stalls, errors). */
  'system.log': (level: 'info' | 'warn' | 'error', message: string, detail?: unknown) => void;
  /** A heartbeat every second with the screen's recent actions, so a freeze leaves a record. */
  'system.heartbeat': (beat: { trail: string[]; visible: boolean; where?: ScreenWhere }) => void;
  /** True once after the watchdog reloaded a stuck screen. */
  'system.recovered': () => ScreenWhere | null;
  /** The screen hit an error it can't draw past: log it and reload, returning to the same place. */
  'system.reloadScreen': (why: string) => void;
  'system.toggleFullscreen': () => boolean;
  'system.openPath': (path: string) => void;
  'system.saveTextFile': (suggestedName: string, content: string) => string | null;
  /** Save a PNG of the window into the playtest folder; returns its path. */
  'system.screenshot': (name: string) => string | null;
}

export type RpcChannel = keyof RpcMap;
export type RpcArgs<C extends RpcChannel> = Parameters<RpcMap[C]>;
export type RpcResult<C extends RpcChannel> = Awaited<ReturnType<RpcMap[C]>>;

export interface EventMap {
  'data.progress': { stage: string; message: string; fraction: number };
  /** The launch check downloaded new market data (loaded now, or `staged` for the next launch). */
  'data.updated': { ok: boolean; message: string; staged: boolean };
}
export type EventChannel = keyof EventMap;

export interface StgBridge {
  invoke<C extends RpcChannel>(channel: C, ...args: RpcArgs<C>): Promise<RpcResult<C>>;
  on<E extends EventChannel>(channel: E, listener: (payload: EventMap[E]) => void): () => void;
}
