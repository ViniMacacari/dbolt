import type { ServiceFailure } from '../types.js';

type ErrorLike = Record<string, unknown>;

function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === 'object' && value !== null;
}

function getStringProperty(value: unknown, key: string): string | undefined {
  if (!isErrorLike(value)) {
    return undefined;
  }

  const property = value[key];
  return typeof property === 'string' ? property : undefined;
}

function getNumberProperty(value: unknown, key: string): number | undefined {
  if (!isErrorLike(value)) {
    return undefined;
  }

  const property = value[key];
  return typeof property === 'number' ? property : undefined;
}

export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const message = getStringProperty(error, 'message');
  if (message) {
    return message;
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  return fallback;
}

export function toFailure(
  error: unknown,
  fallbackMessage: string,
  overrides: Partial<Omit<ServiceFailure, 'success' | 'message'>> & {
    message?: string;
  } = {}
): ServiceFailure {
  const message = overrides.message ?? getErrorMessage(error, fallbackMessage);

  return {
    success: false,
    message,
    error: overrides.error ?? getStringProperty(error, 'error') ?? message,
    code: overrides.code ?? getStringProperty(error, 'code') ?? getNumberProperty(error, 'code') ?? null,
    sql: overrides.sql ?? getStringProperty(error, 'sql') ?? null,
    sqlState: overrides.sqlState ?? getStringProperty(error, 'sqlState') ?? null,
    errno: overrides.errno ?? getNumberProperty(error, 'errno') ?? null
  };
}
