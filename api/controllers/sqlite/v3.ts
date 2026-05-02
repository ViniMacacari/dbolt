import type { Request, Response } from 'express';

import SSQLiteV3 from '../../services/connections/sqlite/v3.js';
import LSQLiteV3 from '../../services/lists/sqlite/v3.js';
import SSSQLiteV3 from '../../services/schemas/sqlite/v3.js';
import SQuerySQLiteV3 from '../../services/queries/sqlite/v3.js';
import ListObjectsSQLiteV3 from '../../services/database-info/sqlite/v3.js';
import { sendBadRequest, sendInternalError, sendServiceResult } from '../../utils/http.js';
import { getConnectionKey } from '../../utils/request-context.js';

import type {
  ConnectionContextPayload,
  DatabaseConnectionConfig,
  QueryRequestBody,
  SchemaRequestBody
} from '../../types.js';

type TableNameParams = { tableName: string };
type ProcedureNameParams = { procedureName: string };

class CSQLiteV3 {
  async testConnection(
    req: Request<Record<string, never>, unknown, Partial<DatabaseConnectionConfig> & ConnectionContextPayload>,
    res: Response
  ): Promise<void> {
    const { connectionKey, ...config } = req.body;
    if (!config.host && !config.database) {
      sendBadRequest(res, 'SQLite database file path is required');
      return;
    }

    try {
      const result = await SSQLiteV3.testConnection(config, connectionKey);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async listDatabases(req: Request, res: Response): Promise<void> {
    try {
      const lsSQLiteV3 = new LSQLiteV3();
      const result = await lsSQLiteV3.listDatabasesAndSchemas(getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async connection(
    req: Request<Record<string, never>, unknown, Partial<DatabaseConnectionConfig> & ConnectionContextPayload>,
    res: Response
  ): Promise<void> {
    const { connectionKey, ...config } = req.body;
    if (!config.host && !config.database) {
      sendBadRequest(res, 'SQLite database file path is required');
      return;
    }

    try {
      const result = await SSQLiteV3.connection(config, connectionKey);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async getSelectedDatabase(req: Request, res: Response): Promise<void> {
    try {
      const result = await SSSQLiteV3.getSelectedDatabase(getConnectionKey(req));
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
      const result = await SSSQLiteV3.setDatabase(req.body.database ?? '', req.body.connectionKey);
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
      const result = await SQuerySQLiteV3.query(req.body.sql, req.body.maxLines, req.body.connectionKey);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async listDatabaseObjects(req: Request, res: Response): Promise<void> {
    try {
      const result = await ListObjectsSQLiteV3.listDatabaseObjects(getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async listTableObjects(req: Request, res: Response): Promise<void> {
    try {
      const result = await ListObjectsSQLiteV3.listTableObjects(getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async tableColumns(req: Request<TableNameParams>, res: Response): Promise<void> {
    try {
      const result = await ListObjectsSQLiteV3.tableColumns(req.params.tableName, getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async tableKeys(req: Request<TableNameParams>, res: Response): Promise<void> {
    try {
      const result = await ListObjectsSQLiteV3.tableKeys(req.params.tableName, getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async tableIndexes(req: Request<TableNameParams>, res: Response): Promise<void> {
    try {
      const result = await ListObjectsSQLiteV3.tableIndexes(req.params.tableName, getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async tableDDL(req: Request<TableNameParams>, res: Response): Promise<void> {
    try {
      const result = await ListObjectsSQLiteV3.tableDDL(req.params.tableName, getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async procedureDDL(req: Request<ProcedureNameParams>, res: Response): Promise<void> {
    try {
      const result = await ListObjectsSQLiteV3.procedureDDL(req.params.procedureName, getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }
}

export default new CSQLiteV3();
