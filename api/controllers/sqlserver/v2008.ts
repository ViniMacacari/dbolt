import type { Request, Response } from 'express';

import SSQLServerV1 from '../../services/connections/sqlserver/v2008.js';
import LSSQLServer1 from '../../services/lists/sqlserver/v2008.js';
import SSSQLServerV1 from '../../services/schemas/sqlserver/v2008.js';
import SQuerySQLServerV1 from '../../services/queries/sqlserver/v2008.js';
import ListObjectsSQLServerV1 from '../../services/database-info/sqlserver/v2008.js';
import { sendBadRequest, sendInternalError, sendServiceResult } from '../../utils/http.js';
import { getConnectionKey } from '../../utils/request-context.js';

import type {
  ConnectionContextPayload,
  QueryRequestBody,
  SchemaRequestBody,
  SqlServerConnectionConfig
} from '../../types.js';

type TableNameParams = { tableName: string };

class CSQLServerV1 {
  async testConnection(
    req: Request<Record<string, never>, unknown, SqlServerConnectionConfig & ConnectionContextPayload>,
    res: Response
  ): Promise<void> {
    const { connectionKey, ...config } = req.body;
    if (!config.host || !config.port || !config.user || !config.password) {
      sendBadRequest(res, 'Invalid configuration');
      return;
    }

    try {
      const result = await SSQLServerV1.testConnection(config, connectionKey);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async listDatabasesAndSchemas(req: Request, res: Response): Promise<void> {
    try {
      const lssql1 = new LSSQLServer1();
      const result = await lssql1.listDatabasesAndSchemas(getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async connection(
    req: Request<Record<string, never>, unknown, SqlServerConnectionConfig & ConnectionContextPayload>,
    res: Response
  ): Promise<void> {
    const { connectionKey, ...config } = req.body;
    if (!config.host || !config.port || !config.user || !config.password) {
      sendBadRequest(res, 'Invalid configuration');
      return;
    }

    try {
      const result = await SSQLServerV1.connection(config, connectionKey);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async getSelectedSchema(req: Request, res: Response): Promise<void> {
    try {
      const result = await SSSQLServerV1.getSelectedSchema(getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async setDatabaseAndSchema(
    req: Request<Record<string, never>, unknown, SchemaRequestBody>,
    res: Response
  ): Promise<void> {
    try {
      const result = await SSSQLServerV1.setDatabaseAndSchema(
        req.body.schema,
        req.body.database,
        req.body.connectionKey
      );
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
      const result = await SQuerySQLServerV1.query(
        req.body.sql,
        req.body.maxLines,
        req.body.connectionKey
      );
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async listObjects(req: Request, res: Response): Promise<void> {
    try {
      const result = await ListObjectsSQLServerV1.listDatabaseObjects(getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Error in listObjects controller:', error);
      sendInternalError(res, error);
    }
  }

  async tableColumns(
    req: Request<TableNameParams>,
    res: Response
  ): Promise<void> {
    try {
      const result = await ListObjectsSQLServerV1.tableColumns(req.params.tableName, getConnectionKey(req));
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
      const result = await ListObjectsSQLServerV1.tableKeys(req.params.tableName, getConnectionKey(req));
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
      const result = await ListObjectsSQLServerV1.tableIndexes(req.params.tableName, getConnectionKey(req));
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
      const result = await ListObjectsSQLServerV1.tableDDL(req.params.tableName, getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }
}

export default new CSQLServerV1();
