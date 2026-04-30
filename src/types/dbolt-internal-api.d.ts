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
  }
}
