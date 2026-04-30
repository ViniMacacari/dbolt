const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

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
