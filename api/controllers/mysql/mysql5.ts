import type { Request, Response } from 'express';

import SMySQLV1 from '../../services/connections/mysql/mysql5.js';
import LSMySQL1 from '../../services/lists/mysql/mysql5.js';
import SSMySQLV1 from '../../services/schemas/mysql/mysql5.js';
import SQueryMySQLV1 from '../../services/queries/mysql/mysql5.js';
import ListObjectsMySQLV1 from '../../services/database-info/mysql/mysql5.js';
import { sendBadRequest, sendInternalError, sendServiceResult } from '../../utils/http.js';

import type {
  DatabaseConnectionConfig,
  QueryRequestBody,
  SchemaRequestBody
} from '../../types.js';

type TableNameParams = { tableName: string };

class CMySQLV1 {
  async testConnection(
    req: Request<Record<string, never>, unknown, DatabaseConnectionConfig>,
    res: Response
  ): Promise<void> {
    const config = req.body;
    if (!config.host || !config.user || !config.password) {
      sendBadRequest(res, 'Invalid configuration');
      return;
    }

    try {
      const result = await SMySQLV1.testConnection(config);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async listDatabases(_req: Request, res: Response): Promise<void> {
    try {
      const lsMySQL1 = new LSMySQL1();
      const result = await lsMySQL1.listDatabasesAndSchemas();
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async connection(
    req: Request<Record<string, never>, unknown, DatabaseConnectionConfig>,
    res: Response
  ): Promise<void> {
    const config = req.body;
    if (!config.host || !config.user || !config.password) {
      sendBadRequest(res, 'Invalid configuration');
      return;
    }

    try {
      const result = await SMySQLV1.connection(config);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async getSelectedDatabase(_req: Request, res: Response): Promise<void> {
    try {
      const result = await SSMySQLV1.getSelectedDatabase();
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async setDatabase(
    req: Request<Record<string, never>, unknown, SchemaRequestBody>,
    res: Response
  ): Promise<void> {
    try {
      const result = await SSMySQLV1.setDatabase(req.body.database ?? '');
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async query(
    req: Request<Record<string, never>, unknown, QueryRequestBody>,
    res: Response
  ): Promise<void> {
    try {
      const result = await SQueryMySQLV1.query(req.body.sql, req.body.maxLines);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async listDatabaseObjects(_req: Request, res: Response): Promise<void> {
    try {
      const result = await ListObjectsMySQLV1.listDatabaseObjects();
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async tableColumns(
    req: Request<TableNameParams>,
    res: Response
  ): Promise<void> {
    try {
      const result = await ListObjectsMySQLV1.tableColumns(req.params.tableName);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }
}

export default new CMySQLV1();
