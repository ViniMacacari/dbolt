import express from 'express';

import SQLiteFiles from '../../services/dbolt/sqlite-files.js';
import { sendInternalError } from '../../utils/http.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const path = typeof req.query['path'] === 'string' ? req.query['path'] : undefined;
    res.status(200).json(await SQLiteFiles.list(path));
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to list SQLite files');
  }
});

export default router;
