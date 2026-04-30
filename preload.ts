const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const INTERNAL_API_TOKEN_CHANNEL = 'dbolt:internal-api-token';

contextBridge.exposeInMainWorld('dboltInternalApi', {
  getSessionToken: async (): Promise<string> => {
    return ipcRenderer.invoke(INTERNAL_API_TOKEN_CHANNEL) as Promise<string>;
  }
});
