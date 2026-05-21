import type { IpcRendererEvent } from 'electron';

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const APP_UPDATE_PLATFORM_CHANNEL = 'dbolt:app-update-platform';
const APP_UPDATE_MANIFEST_CHANNEL = 'dbolt:app-update-manifest';
const APP_UPDATE_INSTALLER_CHANNEL = 'dbolt:app-update-installer';
const INTERNAL_API_SESSION_CHANNEL = 'dbolt:internal-api-session';
const WINDOW_ACTION_CHANNEL = 'dbolt:window-action';
const WINDOW_STATE_CHANNEL = 'dbolt:window-state';
const WINDOW_STATE_CHANGED_CHANNEL = 'dbolt:window-state-changed';

contextBridge.exposeInMainWorld('dboltInternalApi', {
  getSession: async (): Promise<{ baseUrl: string; token: string; tokenHeader: string }> => {
    return ipcRenderer.invoke(INTERNAL_API_SESSION_CHANNEL) as Promise<{
      baseUrl: string;
      token: string;
      tokenHeader: string;
    }>;
  }
});

contextBridge.exposeInMainWorld('dboltAppUpdate', {
  getPlatform: async (): Promise<{ platform: string; canOpenInstaller: boolean }> => {
    return ipcRenderer.invoke(APP_UPDATE_PLATFORM_CHANNEL) as Promise<{
      platform: string;
      canOpenInstaller: boolean;
    }>;
  },
  getDownloadsManifest: async (): Promise<unknown> => {
    return ipcRenderer.invoke(APP_UPDATE_MANIFEST_CHANNEL) as Promise<unknown>;
  },
  downloadAndOpenInstaller: async (
    payload: { url: string; fileName?: string }
  ): Promise<{ filePath: string }> => {
    return ipcRenderer.invoke(APP_UPDATE_INSTALLER_CHANNEL, payload) as Promise<{ filePath: string }>;
  }
});

type DboltWindowAction =
  | 'minimize'
  | 'toggle-maximize'
  | 'close'
  | 'quit'
  | 'reset-zoom'
  | 'zoom-in'
  | 'zoom-out'
  | 'toggle-fullscreen'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'delete'
  | 'select-all'
  | 'open-original-repository';

interface DboltWindowState {
  isFullScreen: boolean;
  isMaximized: boolean;
  platform: string;
}

contextBridge.exposeInMainWorld('dboltWindow', {
  getState: async (): Promise<DboltWindowState> => {
    return ipcRenderer.invoke(WINDOW_STATE_CHANNEL) as Promise<DboltWindowState>;
  },
  invoke: async (action: DboltWindowAction): Promise<DboltWindowState> => {
    return ipcRenderer.invoke(WINDOW_ACTION_CHANNEL, action) as Promise<DboltWindowState>;
  },
  onStateChanged: (callback: (state: DboltWindowState) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: DboltWindowState) => callback(state);
    ipcRenderer.on(WINDOW_STATE_CHANGED_CHANNEL, listener);

    return () => ipcRenderer.removeListener(WINDOW_STATE_CHANGED_CHANNEL, listener);
  }
});
