import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { StgBridge } from '../../src/shared/rpc';

const bridge: StgBridge = {
  invoke: (channel, ...args) => ipcRenderer.invoke('rpc', channel, ...args),
  on: (channel, listener) => {
    const wrapped = (_e: IpcRendererEvent, payload: unknown) => listener(payload as Parameters<typeof listener>[0]);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('stg', bridge);
