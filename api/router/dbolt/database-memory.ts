import express from 'express';

import DatabaseMemory from '../../services/dbolt/database-memory.js';
import DatabaseMemoryInterview from '../../services/dbolt/database-memory-interview.js';
import { sendBadRequest, sendInternalError } from '../../utils/http.js';

const router = express.Router();

const readScope = (body: unknown): Record<string, unknown> | null => {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const scope = (body as Record<string, unknown>)['scope'];
  return scope && typeof scope === 'object' ? scope as Record<string, unknown> : null;
};

router.get('/storage-folder', (_req, res) => {
  res.status(200).json({ success: true, data: { path: DatabaseMemory.getStorageFolder() } });
});

router.post('/notes', async (req, res) => {
  const scope = readScope(req.body);

  if (!scope) {
    sendBadRequest(res, 'No database memory scope provided');
    return;
  }

  try {
    res.status(200).json({ success: true, data: await DatabaseMemory.get(scope) });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to load the database memory');
  }
});

router.post('/notes/add', async (req, res) => {
  const scope = readScope(req.body);
  const notes = req.body?.notes;

  if (!scope || !Array.isArray(notes)) {
    sendBadRequest(res, 'No database memory notes provided');
    return;
  }

  try {
    const source = req.body?.source === 'ai' ? 'ai' : 'user';
    res.status(200).json({ success: true, data: await DatabaseMemory.addNotes(scope, notes, source) });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to save the database memory notes');
  }
});

router.put('/notes/:noteId', async (req, res) => {
  const scope = readScope(req.body);

  if (!scope) {
    sendBadRequest(res, 'No database memory scope provided');
    return;
  }

  try {
    const record = await DatabaseMemory.updateNote(scope, req.params.noteId, {
      topic: req.body?.topic,
      text: req.body?.text
    });
    res.status(200).json({ success: true, data: record });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to update the database memory note');
  }
});

router.post('/notes/:noteId/delete', async (req, res) => {
  const scope = readScope(req.body);

  if (!scope) {
    sendBadRequest(res, 'No database memory scope provided');
    return;
  }

  try {
    res.status(200).json({ success: true, data: await DatabaseMemory.deleteNote(scope, req.params.noteId) });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to delete the database memory note');
  }
});

router.post('/clear', async (req, res) => {
  const scope = readScope(req.body);

  if (!scope) {
    sendBadRequest(res, 'No database memory scope provided');
    return;
  }

  try {
    res.status(200).json({ success: true, data: await DatabaseMemory.clear(scope) });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to clear the database memory');
  }
});

router.post('/interview', async (req, res) => {
  const scope = readScope(req.body);

  if (!scope) {
    sendBadRequest(res, 'No database memory scope provided');
    return;
  }

  try {
    const result = await DatabaseMemoryInterview.run({
      scope,
      readonlyContext: req.body?.readonlyContext,
      messages: req.body?.messages,
      mode: req.body?.mode,
      appLanguage: req.body?.appLanguage
    });
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to run the database memory interview');
  }
});

export default router;
