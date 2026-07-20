import express from 'express';

import AiAssistant from '../../services/dbolt/ai-assistant.js';
import AiAssistantConversations from '../../services/dbolt/ai-assistant-conversations.js';
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

router.get('/conversations', async (_req, res) => {
  try {
    const conversations = await AiAssistantConversations.getState();
    res.status(200).json({ success: true, data: conversations });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to load AI assistant conversations');
  }
});

router.post('/conversations', async (req, res) => {
  try {
    const conversations = await AiAssistantConversations.createConversation(
      typeof req.body?.title === 'string' ? req.body.title : undefined
    );
    res.status(200).json({ success: true, data: conversations });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to create AI assistant conversation');
  }
});

router.put('/conversations/active', async (req, res) => {
  try {
    const conversationId = String(req.body?.conversationId || '').trim();

    if (!conversationId) {
      sendBadRequest(res, 'No AI assistant conversation ID provided');
      return;
    }

    const conversations = await AiAssistantConversations.setActiveConversation(conversationId);
    res.status(200).json({ success: true, data: conversations });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to set active AI assistant conversation');
  }
});

router.put('/conversations/:conversationId', async (req, res) => {
  try {
    const conversationId = String(req.params.conversationId || '').trim();

    if (!conversationId) {
      sendBadRequest(res, 'No AI assistant conversation ID provided');
      return;
    }

    const conversations = await AiAssistantConversations.updateConversation(conversationId, req.body || {});
    res.status(200).json({ success: true, data: conversations });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to save AI assistant conversation');
  }
});

router.delete('/conversations', async (_req, res) => {
  try {
    const conversations = await AiAssistantConversations.deleteAllConversations();
    res.status(200).json({ success: true, data: conversations });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to delete all AI assistant conversations');
  }
});

router.delete('/conversations/:conversationId', async (req, res) => {
  try {
    const conversationId = String(req.params.conversationId || '').trim();

    if (!conversationId) {
      sendBadRequest(res, 'No AI assistant conversation ID provided');
      return;
    }

    const conversations = await AiAssistantConversations.deleteConversation(conversationId);
    res.status(200).json({ success: true, data: conversations });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to delete AI assistant conversation');
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

router.post('/readonly/search-objects', async (req, res) => {
  try {
    const context = req.body?.context;
    const search = String(req.body?.search || '').trim();

    if (!context || typeof context !== 'object') {
      sendBadRequest(res, 'No readonly database context provided');
      return;
    }

    if (!search) {
      sendBadRequest(res, 'No object search term provided');
      return;
    }

    const result = await AiAssistantReadonlyDatabase.searchObjects(
      context,
      search,
      Number(req.body?.limit),
      Array.isArray(req.body?.types) ? req.body.types : undefined
    );
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to search readonly database objects');
  }
});

router.post('/readonly/query', async (req, res) => {
  try {
    const context = req.body?.context;
    const sql = String(req.body?.sql || '').trim();

    if (!context || typeof context !== 'object') {
      sendBadRequest(res, 'No readonly database context provided');
      return;
    }

    if (!sql) {
      sendBadRequest(res, 'No readonly SQL provided');
      return;
    }

    const result = await AiAssistantReadonlyDatabase.runReadOnlyQuery(
      context,
      sql,
      Number(req.body?.maxRows)
    );
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to execute readonly database query');
  }
});

export default router;
