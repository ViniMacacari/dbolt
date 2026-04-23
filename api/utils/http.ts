import type { Response } from 'express';

import type { ServiceResult } from '../types.js';
import { toFailure } from './errors.js';

export function sendServiceResult<T extends object>(
  res: Response,
  result: ServiceResult<T>
): void {
  res.status(result.success ? 200 : 500).json(result);
}

export function sendBadRequest(res: Response, message: string): void {
  res.status(400).json({ success: false, message });
}

export function sendInternalError(
  res: Response,
  error: unknown,
  fallbackMessage = 'Server error'
): void {
  res.status(500).json(toFailure(error, fallbackMessage));
}
