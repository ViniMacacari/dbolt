import type { IpcRendererEvent } from 'electron';

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const APP_UPDATE_PLATFORM_CHANNEL = 'dbolt:app-update-platform';
const APP_UPDATE_MANIFEST_CHANNEL = 'dbolt:app-update-manifest';
const APP_UPDATE_INSTALLER_CHANNEL = 'dbolt:app-update-installer';
const APP_UPDATE_PROGRESS_CHANNEL = 'dbolt:app-update-progress';
const INTERNAL_API_SESSION_CHANNEL = 'dbolt:internal-api-session';
const WINDOW_ACTION_CHANNEL = 'dbolt:window-action';
const WINDOW_STATE_CHANNEL = 'dbolt:window-state';
const WINDOW_STATE_CHANGED_CHANNEL = 'dbolt:window-state-changed';
const WINDOW_CLOSE_REQUESTED_CHANNEL = 'dbolt:window-close-requested';
const WINDOW_CLOSE_RESPONSE_CHANNEL = 'dbolt:window-close-response';

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
    payload: { url: string; fileName?: string; requestId: string }
  ): Promise<{ filePath: string }> => {
    return ipcRenderer.invoke(APP_UPDATE_INSTALLER_CHANNEL, payload) as Promise<{ filePath: string }>;
  },
  onDownloadProgress: (callback: (progress: {
    requestId: string;
    phase: 'preparing' | 'downloading' | 'opening';
    receivedBytes: number;
    totalBytes: number | null;
    percentage: number | null;
  }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, progress: {
      requestId: string;
      phase: 'preparing' | 'downloading' | 'opening';
      receivedBytes: number;
      totalBytes: number | null;
      percentage: number | null;
    }) => callback(progress);
    ipcRenderer.on(APP_UPDATE_PROGRESS_CHANNEL, listener);

    return () => ipcRenderer.removeListener(APP_UPDATE_PROGRESS_CHANNEL, listener);
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
  respondToCloseRequest: async (shouldClose: boolean): Promise<void> => {
    await ipcRenderer.invoke(WINDOW_CLOSE_RESPONSE_CHANNEL, shouldClose);
  },
  onCloseRequested: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on(WINDOW_CLOSE_REQUESTED_CHANNEL, listener);

    return () => ipcRenderer.removeListener(WINDOW_CLOSE_REQUESTED_CHANNEL, listener);
  },
  onStateChanged: (callback: (state: DboltWindowState) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: DboltWindowState) => callback(state);
    ipcRenderer.on(WINDOW_STATE_CHANGED_CHANNEL, listener);

    return () => ipcRenderer.removeListener(WINDOW_STATE_CHANGED_CHANNEL, listener);
  }
});
