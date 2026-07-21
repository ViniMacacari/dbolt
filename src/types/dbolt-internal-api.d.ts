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

interface DboltAppUpdateProgress {
  requestId: string;
  phase: 'preparing' | 'downloading' | 'opening';
  receivedBytes: number;
  totalBytes: number | null;
  percentage: number | null;
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
        requestId: string;
      }): Promise<{
        filePath: string;
      }>;
      onDownloadProgress(callback: (progress: DboltAppUpdateProgress) => void): () => void;
    };
    dboltWindow?: {
      getState(): Promise<DboltWindowState>;
      invoke(action: DboltWindowAction): Promise<DboltWindowState>;
      respondToCloseRequest(shouldClose: boolean): Promise<void>;
      onCloseRequested(callback: () => void): () => void;
      onStateChanged(callback: (state: DboltWindowState) => void): () => void;
    };
  }
}
