import type { NextFunction, Request, Response } from 'express';

import {
  INTERNAL_API_TOKEN_HEADER,
  isValidInternalApiSessionToken
} from '../services/security/internal-session-token.js';

export function requireInternalSessionToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  if (isValidInternalApiSessionToken(req.get(INTERNAL_API_TOKEN_HEADER))) {
    next();
    return;
  }

  res.status(401).json({
    success: false,
    message: 'Unauthorized internal API request.'
  });
}
