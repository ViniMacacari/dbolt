export type UnhandledProcessErrorScope = 'uncaughtException' | 'unhandledRejection';

export type UnhandledProcessErrorReporter = (
  scope: UnhandledProcessErrorScope,
  error: unknown
) => void;

const reporters = new Set<UnhandledProcessErrorReporter>();
let guardsInstalled = false;

export function onUnhandledProcessError(
  reporter: UnhandledProcessErrorReporter
): () => void {
  reporters.add(reporter);

  return () => {
    reporters.delete(reporter);
  };
}

function reportUnhandledError(scope: UnhandledProcessErrorScope, error: unknown): void {
  console.error(`Recovered from an unhandled ${scope}:`, error);

  for (const reporter of reporters) {
    try {
      reporter(scope, error);
    } catch (reporterError: unknown) {
      console.error('Failed to report an unhandled process error:', reporterError);
    }
  }
}

export function installProcessSafetyGuards(): void {
  if (guardsInstalled) {
    return;
  }

  guardsInstalled = true;

  process.on('uncaughtException', (error: unknown) => {
    reportUnhandledError('uncaughtException', error);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    reportUnhandledError('unhandledRejection', reason);
  });
}
