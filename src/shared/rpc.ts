/**
 * The typed contract between the renderer and the Electron main process.
 * Every channel name maps to a function signature; the preload exposes a single
 * generic `invoke`, and both sides are checked against this map.
 */

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
}

export interface DataBuildRequest {
  mode: 'synthetic' | 'real' | 'sync';
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

import type { DrillRow, RunRow, SaveSlot, TradeRow } from './userData';

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
  'system.info': () => SystemInfo;
  'system.quit': () => void;
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
}
export type EventChannel = keyof EventMap;

export interface StgBridge {
  invoke<C extends RpcChannel>(channel: C, ...args: RpcArgs<C>): Promise<RpcResult<C>>;
  on<E extends EventChannel>(channel: E, listener: (payload: EventMap[E]) => void): () => void;
}
