import sql, {
  type ConnectionPool,
  type config as SqlConfig,
  type IResult
} from 'mssql';

import type {
  ConnectionStatus,
  QueryRows,
  SqlServerConnectionConfig,
  SqlServerQueryParameter
} from '../../types.js';

type SqlServerConnectionInput = SqlServerConnectionConfig | SqlConfig;

class SQLServerV1 {
  private static instance: SQLServerV1 | null = null;

  public pool: ConnectionPool | null = null;
  private config: SqlConfig | null = null;

  constructor() {
    if (SQLServerV1.instance) {
      return SQLServerV1.instance;
    }

    SQLServerV1.instance = this;
  }

  async connect(config: SqlServerConnectionInput): Promise<ConnectionPool | undefined> {
    if (this.pool) {
      await this.disconnect();
    }

    const normalizedHost =
      'host' in config && typeof config.host === 'string'
        ? config.host
        : config.server;
    const normalizedTopLevelPort =
      typeof config.port === 'number'
        ? config.port
        : config.port !== undefined
          ? Number.parseInt(String(config.port), 10)
          : 1433;
    const normalizedOptionPort =
      typeof config.options?.port === 'number'
        ? config.options.port
        : config.options?.port !== undefined
          ? Number.parseInt(String(config.options.port), 10)
          : undefined;
    const { options, ...baseConfig } = config;
    const { port: _ignoredOptionPort, ...restOptions } = options ?? {};

    const normalizedConfig: SqlConfig = {
      ...baseConfig,
      server: normalizedHost,
      port: normalizedTopLevelPort,
      options: {
        ...restOptions,
        port: normalizedOptionPort,
        encrypt: options?.encrypt ?? false,
        trustServerCertificate: options?.trustServerCertificate ?? true
      }
    };

    this.config = normalizedConfig;

    try {
      this.pool = await sql.connect(normalizedConfig);
      console.log('Connected to SQL Server successfully');
      return this.pool;
    } catch (error: unknown) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;

      if (code === 'ETIMEOUT' || code === 'ELOGIN') {
        console.warn('SQL Server is inactive or unreachable');
        return undefined;
      }

      console.error('Error connecting to SQL Server:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.pool) {
      console.warn('Not connected to SQL Server');
      return;
    }

    try {
      await this.pool.close();
      console.log('Disconnected from SQL Server successfully');
    } catch (error: unknown) {
      console.error('Error disconnecting from SQL Server:', error);
      throw error;
    } finally {
      this.pool = null;
    }
  }

  async executeQuery(
    query: string,
    params: readonly SqlServerQueryParameter[] = []
  ): Promise<QueryRows> {
    if (!this.pool) {
      throw new Error('Not connected to SQL Server.');
    }

    try {
      const request = this.pool.request();

      for (const parameter of params) {
        request.input(parameter.name, parameter.type, parameter.value);
      }

      const result: IResult<Record<string, unknown>> = await request.query(query);
      return result.recordset as QueryRows;
    } catch (error: unknown) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  getStatus(): ConnectionStatus {
    return this.pool ? 'connected' : 'disconnected';
  }

  getConfig(): SqlConfig {
    if (!this.config) {
      throw new Error('No configuration available');
    }

    return this.config;
  }
}

export default SQLServerV1;
