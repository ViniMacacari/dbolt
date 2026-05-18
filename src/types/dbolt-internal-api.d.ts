export {};

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
  }
}
