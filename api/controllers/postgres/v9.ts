import type { Request, Response } from 'express';

import SPgV1 from '../../services/connections/postgres/v9.js';
import LSPg1 from '../../services/lists/postgres/v9.js';
import SSPgV1 from '../../services/schemas/postgres/v9.js';
import SQueryPgV1 from '../../services/queries/postgres/v9.js';
import ListObjectsPgV1 from '../../services/database-info/postgres/v9.js';
import { sendBadRequest, sendInternalError, sendServiceResult } from '../../utils/http.js';

import type {
  DatabaseConnectionConfig,
  QueryRequestBody,
  SchemaRequestBody
} from '../../types.js';

type TableNameParams = { tableName: string };

class CPostgresV1 {
  async testConnection(
    req: Request<Record<string, never>, unknown, DatabaseConnectionConfig>,
    res: Response
  ): Promise<void> {
    const config = req.body;
    if (!config.host || !config.port || !config.user || !config.password) {
      sendBadRequest(res, 'Invalid configuration');
      return;
    }

    try {
      const result = await SPgV1.testConnection(config);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async listDatabasesAndSchemas(
    _req: Request,
    res: Response
  ): Promise<void> {
    try {
      const lspg1 = new LSPg1();
      const result = await lspg1.listDatabasesAndSchemas();
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
    if (!config.host || !config.port || !config.user || !config.password) {
      sendBadRequest(res, 'Invalid configuration');
      return;
    }

    try {
      const result = await SPgV1.connection(config);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async getSelectedSchema(_req: Request, res: Response): Promise<void> {
    try {
      const result = await SSPgV1.getSelectedSchema();
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
      const result = await SSPgV1.setDatabaseAndSchema(
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
      const result = await SQueryPgV1.query(req.body.sql, req.body.maxLines);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async listDatabaseObjects(_req: Request, res: Response): Promise<void> {
    try {
      const result = await ListObjectsPgV1.listDatabaseObjects();
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
      const result = await ListObjectsPgV1.tableColumns(req.params.tableName);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }
}

export default new CPostgresV1();
