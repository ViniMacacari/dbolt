const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const APP_UPDATE_PLATFORM_CHANNEL = 'dbolt:app-update-platform';
const APP_UPDATE_MANIFEST_CHANNEL = 'dbolt:app-update-manifest';
const APP_UPDATE_INSTALLER_CHANNEL = 'dbolt:app-update-installer';
const INTERNAL_API_SESSION_CHANNEL = 'dbolt:internal-api-session';

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
