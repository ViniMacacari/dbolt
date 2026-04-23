import express from 'express';

import LoadConnections from '../../services/dbolt/load-connection.js';
import SaveConnection from '../../services/dbolt/save-connection.js';
import { sendBadRequest, sendInternalError } from '../../utils/http.js';

import type { SavedConnectionInput } from '../../types.js';

const router = express.Router();

router.post('/new', async (req, res) => {
  try {
    const connectionData = req.body as SavedConnectionInput;

    if (!connectionData || Object.keys(connectionData).length === 0) {
      sendBadRequest(res, 'No connection data provided');
      return;
    }

    const result = await SaveConnection.newConnection(connectionData);
    res.status(200).json(result);
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to save connection');
  }
});

router.get('/load', async (_req, res) => {
  try {
    const connections = await LoadConnections.getAllConnections();
    res.status(200).json(connections);
  } catch (error: unknown) {
    console.error('Error loading connections:', error);
    sendInternalError(res, error, 'Failed to load connection');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const connection = await LoadConnections.getConnectionById(id);

    if (!connection) {
      res
        .status(404)
        .json({ success: false, message: `Connection with ID ${req.params.id} not found` });
      return;
    }

    res.status(200).json(connection);
  } catch (error: unknown) {
    console.error(`Error loading connection with ID ${req.params.id}:`, error);
    sendInternalError(res, error, 'Failed to load connection');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const success = await LoadConnections.deleteConnectionById(id);

    if (!success) {
      res
        .status(404)
        .json({ success: false, message: `Connection with ID ${req.params.id} not found` });
      return;
    }

    res
      .status(200)
      .json({ success: true, message: `Connection with ID ${req.params.id} deleted successfully` });
  } catch (error: unknown) {
    console.error(`Error deleting connection with ID ${req.params.id}:`, error);
    sendInternalError(res, error, 'Failed to delete connection');
  }
});

export default router;
