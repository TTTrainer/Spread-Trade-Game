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

// Filled out by later phases (market, user and data channels are declared in their own modules
// and merged here so this file stays the single source of truth for channel names).
export interface RpcMap {
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
