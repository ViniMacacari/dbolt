import express from 'express';

import AiAssistant from '../../services/dbolt/ai-assistant.js';
import AiAssistantReadonlyDatabase from '../../services/dbolt/ai-assistant-readonly-database.js';
import AiAssistantSettings from '../../services/dbolt/ai-assistant-settings.js';
import { sendBadRequest, sendInternalError } from '../../utils/http.js';

const router = express.Router();

router.get('/settings', async (_req, res) => {
  try {
    const settings = await AiAssistantSettings.getSettings();
    res.status(200).json({ success: true, data: settings });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to load AI assistant settings');
  }
});

router.put('/settings', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      sendBadRequest(res, 'No AI assistant settings provided');
      return;
    }

    const settings = await AiAssistantSettings.saveSettings(req.body);
    res.status(200).json({ success: true, data: settings });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to save AI assistant settings');
  }
});

router.post('/chat', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      sendBadRequest(res, 'No AI assistant chat payload provided');
      return;
    }

    const result = await AiAssistant.chat(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to request AI assistant response');
  }
});

router.post('/readonly/schema-summary', async (req, res) => {
  try {
    const context = req.body?.context;
    if (!context || typeof context !== 'object') {
      sendBadRequest(res, 'No readonly database context provided');
      return;
    }

    const result = await AiAssistantReadonlyDatabase.getSchemaSummary(
      context,
      Number(req.body?.limit),
      String(req.body?.search || '')
    );
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to load readonly schema summary');
  }
});

router.post('/readonly/table-columns', async (req, res) => {
  try {
    const context = req.body?.context;
    const tableName = String(req.body?.tableName || '').trim();

    if (!context || typeof context !== 'object') {
      sendBadRequest(res, 'No readonly database context provided');
      return;
    }

    if (!tableName) {
      sendBadRequest(res, 'No table name provided');
      return;
    }

    const result = await AiAssistantReadonlyDatabase.getTableColumns(
      context,
      tableName,
      Number(req.body?.limit)
    );
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to load readonly table columns');
  }
});

export default router;
