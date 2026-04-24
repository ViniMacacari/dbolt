import type { Request, Response } from 'express';

import SMySQLV1 from '../../services/connections/mysql/mysql5.js';
import LSMySQL1 from '../../services/lists/mysql/mysql5.js';
import SSMySQLV1 from '../../services/schemas/mysql/mysql5.js';
import SQueryMySQLV1 from '../../services/queries/mysql/mysql5.js';
import ListObjectsMySQLV1 from '../../services/database-info/mysql/mysql5.js';
import { sendBadRequest, sendInternalError, sendServiceResult } from '../../utils/http.js';
import { getConnectionKey } from '../../utils/request-context.js';

import type {
  ConnectionContextPayload,
  DatabaseConnectionConfig,
  QueryRequestBody,
  SchemaRequestBody
} from '../../types.js';

type TableNameParams = { tableName: string };

class CMySQLV1 {
  async testConnection(
    req: Request<Record<string, never>, unknown, DatabaseConnectionConfig & ConnectionContextPayload>,
    res: Response
  ): Promise<void> {
    const { connectionKey, ...config } = req.body;
    if (!config.host || !config.user || !config.password) {
      sendBadRequest(res, 'Invalid configuration');
      return;
    }

    try {
      const result = await SMySQLV1.testConnection(config, connectionKey);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async listDatabases(req: Request, res: Response): Promise<void> {
    try {
      const lsMySQL1 = new LSMySQL1();
      const result = await lsMySQL1.listDatabasesAndSchemas(getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async connection(
    req: Request<Record<string, never>, unknown, DatabaseConnectionConfig & ConnectionContextPayload>,
    res: Response
  ): Promise<void> {
    const { connectionKey, ...config } = req.body;
    if (!config.host || !config.user || !config.password) {
      sendBadRequest(res, 'Invalid configuration');
      return;
    }

    try {
      const result = await SMySQLV1.connection(config, connectionKey);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async getSelectedDatabase(req: Request, res: Response): Promise<void> {
    try {
      const result = await SSMySQLV1.getSelectedDatabase(getConnectionKey(req));
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
      const result = await SSMySQLV1.setDatabase(req.body.database ?? '', req.body.connectionKey);
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
      const result = await SQueryMySQLV1.query(req.body.sql, req.body.maxLines, req.body.connectionKey);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async listDatabaseObjects(req: Request, res: Response): Promise<void> {
    try {
      const result = await ListObjectsMySQLV1.listDatabaseObjects(getConnectionKey(req));
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
      const result = await ListObjectsMySQLV1.tableColumns(req.params.tableName, getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async tableKeys(
    req: Request<TableNameParams>,
    res: Response
  ): Promise<void> {
    try {
      const result = await ListObjectsMySQLV1.tableKeys(req.params.tableName, getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async tableIndexes(
    req: Request<TableNameParams>,
    res: Response
  ): Promise<void> {
    try {
      const result = await ListObjectsMySQLV1.tableIndexes(req.params.tableName, getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async tableDDL(
    req: Request<TableNameParams>,
    res: Response
  ): Promise<void> {
    try {
      const result = await ListObjectsMySQLV1.tableDDL(req.params.tableName, getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }
}

export default new CMySQLV1();
