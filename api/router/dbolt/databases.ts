import express from 'express';

import Databases from '../../services/dbolt/databases.js';
import { sendInternalError } from '../../utils/http.js';

const router = express.Router();

router.get('/avaliable', async (_req, res) => {
  try {
    const connections = await Databases.avaliablesConnections();
    res.status(200).json(connections);
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to fetch available connections');
  }
});

export default router;
