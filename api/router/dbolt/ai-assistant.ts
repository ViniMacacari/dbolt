import express from 'express';

import AiAssistant from '../../services/dbolt/ai-assistant.js';
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

export default router;
