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

export interface RpcMap {
  /** Market data: `asOf` is the caller's simulated date; the main process refuses anything later. */
  'market.call': (method: string, args: unknown[], asOf: string | null) => unknown;
  'data.status': () => DataStatus;
  'data.build': (req: DataBuildRequest) => DataBuildResult;
  'data.report': () => string;
  'system.info': () => SystemInfo;
  'system.quit': () => void;
  'system.toggleFullscreen': () => boolean;
  'system.openPath': (path: string) => void;
  'system.saveTextFile': (suggestedName: string, content: string) => string | null;
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
