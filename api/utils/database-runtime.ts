type EventfulConnection = {
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

function readDurationSetting(variableName: string, fallbackMs: number): number {
  const rawValue = process.env[variableName];

  if (rawValue === undefined || rawValue.trim() === '') {
    return fallbackMs;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : fallbackMs;
}

/**
 * Time budget to open a new connection. Without it a dropped network keeps the
 * request pending until the operating system gives up on the TCP handshake.
 */
export const DB_CONNECT_TIMEOUT_MS = readDurationSetting('DBOLT_DB_CONNECT_TIMEOUT_MS', 20_000);

/**
 * TCP keep-alive probe delay. It is what turns a silently dead link into a real
 * connection error instead of a query that never settles.
 */
export const DB_KEEP_ALIVE_DELAY_MS = readDurationSetting('DBOLT_DB_KEEP_ALIVE_DELAY_MS', 10_000);

/**
 * Server side statement timeout. Disabled by default so legitimately slow
 * queries are allowed to finish, and opt-in through the environment variable.
 */
export const DB_STATEMENT_TIMEOUT_MS = readDurationSetting('DBOLT_DB_STATEMENT_TIMEOUT_MS', 0);

/**
 * Driver side request timeout. Defaults to unlimited so the SQL Server driver
 * stops aborting slow queries after its own 15 second default.
 */
export const DB_REQUEST_TIMEOUT_MS = readDurationSetting('DBOLT_DB_REQUEST_TIMEOUT_MS', 0);

export const DB_CANCEL_TIMEOUT_MS = readDurationSetting('DBOLT_DB_CANCEL_TIMEOUT_MS', 5_000);

/**
 * Database drivers emit `error` on their connection objects when the link dies
 * outside of a query (network drop, server restart, idle timeout). An emitter
 * without an `error` listener makes Node throw, which crashes the Electron main
 * process and shows the native crash dialog. Listening keeps the failure as
 * data: the connection is dropped from the pool and the next query reports a
 * normal "not connected" error that the UI already knows how to recover from.
 */
export function watchConnectionFailures(
  connection: unknown,
  databaseName: string,
  onConnectionLost: (error: unknown) => void
): void {
  const emitter = connection as Partial<EventfulConnection> | null;

  if (typeof emitter?.on !== 'function') {
    return;
  }

  emitter.on('error', (error: unknown) => {
    console.warn(`Lost the ${databaseName} connection:`, error);
    onConnectionLost(error);
  });
}
