import type { Request, Response } from 'express';

import SHanaV1 from '../../services/connections/hana/hana-v1.js';
import LSHanaV1 from '../../services/lists/hana/hana-v1.js';
import SSchemaHanaV1 from '../../services/schemas/hana/hana-v1.js';
import SQuerysHana from '../../services/queries/hana/hana-v1.js';
import ListObjectsHanaV1 from '../../services/database-info/hana/hana-v1.js';
import { sendBadRequest, sendInternalError, sendServiceResult } from '../../utils/http.js';
import { getConnectionKey } from '../../utils/request-context.js';

import type {
  ConnectionContextPayload,
  HanaConnectionConfig,
  QueryRequestBody,
  SchemaRequestBody
} from '../../types.js';

type TableNameParams = { tableName: string };

class CHanaV1 {
  async testConnection(
    req: Request<Record<string, never>, unknown, HanaConnectionConfig & ConnectionContextPayload>,
    res: Response
  ): Promise<void> {
    const { connectionKey, ...config } = req.body;
    if (!config.host || !config.port || !config.user || !config.password) {
      sendBadRequest(res, 'Invalid configuration');
      return;
    }

    try {
      const result = await SHanaV1.testConnection(config, connectionKey);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async connection(
    req: Request<Record<string, never>, unknown, HanaConnectionConfig & ConnectionContextPayload>,
    res: Response
  ): Promise<void> {
    const { connectionKey, ...config } = req.body;
    if (!config.host || !config.port || !config.user || !config.password) {
      sendBadRequest(res, 'Invalid configuration');
      return;
    }

    try {
      const result = await SHanaV1.connection(config, connectionKey);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      console.error('Controller error:', error);
      sendInternalError(res, error);
    }
  }

  async listDatabasesAndSchemas(req: Request, res: Response): Promise<void> {
    try {
      const lshana1 = new LSHanaV1();
      const result = await lshana1.listDatabasesAndSchemas(getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async getSelectedSchema(req: Request, res: Response): Promise<void> {
    try {
      const result = await SSchemaHanaV1.getSelectedSchema(getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async setSchema(
    req: Request<Record<string, never>, unknown, SchemaRequestBody>,
    res: Response
  ): Promise<void> {
    try {
      const result = await SSchemaHanaV1.setSchema(req.body.schema ?? '', req.body.connectionKey);
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
      const result = await SQuerysHana.query(req.body.sql, req.body.maxLines, req.body.connectionKey);
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }

  async listDatabaseObjects(req: Request, res: Response): Promise<void> {
    try {
      const result = await ListObjectsHanaV1.listDatabaseObjects(getConnectionKey(req));
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
      const result = await ListObjectsHanaV1.tableColumns(req.params.tableName, getConnectionKey(req));
      sendServiceResult(res, result);
    } catch (error: unknown) {
      sendInternalError(res, error);
    }
  }
}

export default new CHanaV1();
