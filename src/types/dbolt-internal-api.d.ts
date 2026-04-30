export {};

declare global {
  interface Window {
    dboltInternalApi?: {
      getSessionToken(): Promise<string>;
    };
  }
}
