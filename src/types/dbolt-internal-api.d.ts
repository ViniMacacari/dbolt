export {};

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

declare global {
  interface Window {
    dboltInternalApi?: {
      getSession(): Promise<{
        baseUrl: string;
        token: string;
        tokenHeader: string;
      }>;
    };
    dboltAppUpdate?: {
      getPlatform(): Promise<{
        platform: string;
        canOpenInstaller: boolean;
      }>;
      getDownloadsManifest(): Promise<unknown>;
      downloadAndOpenInstaller(payload: {
        url: string;
        fileName?: string;
      }): Promise<{
        filePath: string;
      }>;
    };
    dboltWindow?: {
      getState(): Promise<DboltWindowState>;
      invoke(action: DboltWindowAction): Promise<DboltWindowState>;
      onStateChanged(callback: (state: DboltWindowState) => void): () => void;
    };
  }
}
