import express from 'express';

import LoadQueries from '../../services/dbolt/load-query.js';
import SaveQuery from '../../services/dbolt/save-query.js';
import { sendBadRequest, sendInternalError } from '../../utils/http.js';

import type { SavedQueryInput } from '../../types.js';

const router = express.Router();

router.post('/new', async (req, res) => {
  try {
    const queryData = req.body as SavedQueryInput;

    if (!queryData || Object.keys(queryData).length === 0) {
      sendBadRequest(res, 'No query data provided');
      return;
    }

    const result = await SaveQuery.newQuery(queryData);
    res.status(200).json(result);
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to save query');
  }
});

router.get('/load', async (_req, res) => {
  try {
    const queries = await LoadQueries.getAllQueries();
    res.status(200).json(queries);
  } catch (error: unknown) {
    console.error('Error loading queries:', error);
    sendInternalError(res, error, 'Failed to load queries');
  }
});

router.get('/folders', async (_req, res) => {
  try {
    const folders = await LoadQueries.getFolders();
    res.status(200).json({ success: true, data: folders });
  } catch (error: unknown) {
    console.error('Error loading query folders:', error);
    sendInternalError(res, error, 'Failed to load query folders');
  }
});

router.get('/:id/versions', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const versions = await LoadQueries.getQueryVersions(id);
    res.status(200).json({ success: true, data: versions });
  } catch (error: unknown) {
    console.error(`Error loading query versions with ID ${req.params.id}:`, error);
    sendInternalError(res, error, 'Failed to load query versions');
  }
});

router.get('/:id/versions/:versionId', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const versionId = Number.parseInt(req.params.versionId, 10);
    const version = await LoadQueries.getQueryVersionById(id, versionId);

    if (!version) {
      res
        .status(404)
        .json({ success: false, message: `Version with ID ${req.params.versionId} not found` });
      return;
    }

    res.status(200).json(version);
  } catch (error: unknown) {
    console.error(`Error loading query version with ID ${req.params.versionId}:`, error);
    sendInternalError(res, error, 'Failed to load query version');
  }
});

router.post('/:id/versions/:versionId/restore', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const versionId = Number.parseInt(req.params.versionId, 10);
    const result = await SaveQuery.restoreVersion(id, versionId);

    res.status(200).json(result);
  } catch (error: unknown) {
    console.error(`Error restoring query version with ID ${req.params.versionId}:`, error);
    sendInternalError(res, error, 'Failed to restore query version');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const query = await LoadQueries.getQueryById(id);

    if (!query) {
      res
        .status(404)
        .json({ success: false, message: `Query with ID ${req.params.id} not found` });
      return;
    }

    res.status(200).json(query);
  } catch (error: unknown) {
    console.error(`Error loading query with ID ${req.params.id}:`, error);
    sendInternalError(res, error, 'Failed to load query');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const success = await LoadQueries.deleteQueryById(id);

    if (!success) {
      res
        .status(404)
        .json({ success: false, message: `Query with ID ${req.params.id} not found` });
      return;
    }

    res
      .status(200)
      .json({ success: true, message: `Query with ID ${req.params.id} deleted successfully` });
  } catch (error: unknown) {
    console.error(`Error deleting query with ID ${req.params.id}:`, error);
    sendInternalError(res, error, 'Failed to delete query');
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const data = req.body as SavedQueryInput;
    const result = await SaveQuery.updateExistingQuery(id, data);

    res.status(200).json(result);
  } catch (error: unknown) {
    console.error(`Error updating query with ID ${req.params.id}:`, error);
    sendInternalError(res, error, 'Failed to update query');
  }
});

export default router;
