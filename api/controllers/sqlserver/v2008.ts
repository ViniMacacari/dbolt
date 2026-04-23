import type { Request, Response } from 'express';

import SSQLServerV1 from '../../services/connections/sqlserver/v2008.js';
import LSSQLServer1 from '../../services/lists/sqlserver/v2008.js';
import SSSQLServerV1 from '../../services/schemas/sqlserver/v2008.js';
import SQuerySQLServerV1 from '../../services/queries/sqlserver/v2008.js';
import ListObjectsSQLServerV1 from '../../services/database-info/sqlserver/v2008.js';
import { sendBadRequest, sendInternalError, sendServiceResult } from '../../utils/http.js';

import type {
  QueryRequestBody,
  SchemaRequestBody,
  SqlServerConnectionConfig
} from '../../types.js';

type TableNameParams = { tableName: string };

class CSQLServerV1 {
  async testConnection(
    req: Request<Record<string, never>, unknown, SqlServerConnectionConfig>,
    res: Response
  ): Promise<void> {
    const config = req.body;
    if (!config.host || !config.port || !config.user || !config.password) {
      sendBadRequest(res, 'Invalid configuration');
      return;
    }

    try {
      const result = await SSQLServerV1.testConnection(config);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async listDatabasesAndSchemas(_req: Request, res: Response): Promise<void> {
    try {
      const lssql1 = new LSSQLServer1();
      const result = await lssql1.listDatabasesAndSchemas();
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async connection(
    req: Request<Record<string, never>, unknown, SqlServerConnectionConfig>,
    res: Response
  ): Promise<void> {
    const config = req.body;
    if (!config.host || !config.port || !config.user || !config.password) {
      sendBadRequest(res, 'Invalid configuration');
      return;
    }

    try {
      const result = await SSQLServerV1.connection(config);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async getSelectedSchema(_req: Request, res: Response): Promise<void> {
    try {
      const result = await SSSQLServerV1.getSelectedSchema();
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
        req.body.database
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
        req.body.maxLines
      );
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async listObjects(_req: Request, res: Response): Promise<void> {
    try {
      const result = await ListObjectsSQLServerV1.listDatabaseObjects();
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
      const result = await ListObjectsSQLServerV1.tableColumns(req.params.tableName);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }
}

export default new CSQLServerV1();
