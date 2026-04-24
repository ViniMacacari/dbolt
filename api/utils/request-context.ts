import type { Request } from 'express';

export function getConnectionKey(req: Request): string | undefined {
  const body = typeof req.body === 'object' && req.body !== null
    ? (req.body as { connectionKey?: unknown }).connectionKey
    : undefined;
  const query = req.query.connectionKey;
  const value = body ?? query;

  return typeof value === 'string' && value.trim() ? value : undefined;
}
