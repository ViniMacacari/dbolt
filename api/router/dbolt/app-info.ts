import express from 'express';

import AppInfo from '../../services/dbolt/app-info.js';
import { sendInternalError } from '../../utils/http.js';

const router = express.Router();

router.get('/', (_req, res) => {
  try {
    res.status(200).json(AppInfo.getAppInfo());
  } catch (error: unknown) {
    sendInternalError(res, error, 'Failed to fetch app info');
  }
});

export default router;
