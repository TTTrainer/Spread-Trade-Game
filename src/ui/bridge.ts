import type { StgBridge } from '../shared/rpc';

declare global {
  interface Window {
    stg?: StgBridge;
  }
}

/** The preload bridge. Missing only when the renderer runs outside Electron (e.g. a plain browser). */
export function bridge(): StgBridge {
  if (!window.stg) throw new Error('Game bridge unavailable: start the game through Electron.');
  return window.stg;
}

export function hasBridge(): boolean {
  return typeof window !== 'undefined' && !!window.stg;
}
