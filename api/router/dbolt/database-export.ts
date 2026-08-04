import express from 'express';

import DatabaseExport, {
  DatabaseExportCancelledError,
  type DatabaseExportEstimateRequest,
  type DatabaseExportRunRequest
} from '../../services/dbolt/database-export.js';
import { sendBadRequest, sendInternalError } from '../../utils/http.js';

const router = express.Router();

router.post('/disconnect', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      sendBadRequest(res, 'No database export connection context provided');
      return;
    }

    await DatabaseExport.disconnect(req.body as DatabaseExportEstimateRequest['context']);
    res.status(200).json({ success: true });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to disconnect database export');
  }
});

router.post('/estimate', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      sendBadRequest(res, 'No database export estimate payload provided');
      return;
    }

    const estimate = await DatabaseExport.estimate(req.body as DatabaseExportEstimateRequest);
    res.status(200).json({ success: true, data: estimate });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to estimate database export');
  }
});

router.post('/stream', async (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    sendBadRequest(res, 'No database export payload provided');
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let cancelled = false;
  res.once('close', () => {
    if (!res.writableEnded) cancelled = true;
  });

  const writeEvent = (event: Record<string, unknown>): void => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`${JSON.stringify(event)}\n`);
    }
  };

  try {
    const result = await DatabaseExport.exportToFile(
      req.body as DatabaseExportRunRequest,
      (progress) => writeEvent({ type: 'progress', data: progress }),
      () => cancelled
    );
    writeEvent({ type: 'result', data: result });
  } catch (error: unknown) {
    writeEvent({
      type: error instanceof DatabaseExportCancelledError ? 'cancelled' : 'error',
      message: error instanceof Error ? error.message : 'Failed to export database'
    });
  } finally {
    res.end();
  }
});

export default router;
