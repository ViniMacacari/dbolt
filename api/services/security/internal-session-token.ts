import { randomBytes, timingSafeEqual } from 'node:crypto';

export const INTERNAL_API_TOKEN_HEADER = 'x-dbolt-session-token';

const INTERNAL_API_SESSION_TOKEN = randomBytes(48).toString('base64url');

export function getInternalApiSessionToken(): string {
  return INTERNAL_API_SESSION_TOKEN;
}

export function isValidInternalApiSessionToken(value: unknown): boolean {
  const token = Array.isArray(value) ? value[0] : value;

  if (typeof token !== 'string' || token.length === 0) {
    return false;
  }

  const expected = Buffer.from(INTERNAL_API_SESSION_TOKEN);
  const actual = Buffer.from(token);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
