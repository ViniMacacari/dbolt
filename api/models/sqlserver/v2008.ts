import sql, {
  type ConnectionPool,
  type config as SqlConfig,
  type IResult
} from 'mssql';

import type {
  ConnectionStatus,
  QueryRows,
  QueryRowsWithColumns,
  SqlServerConnectionConfig,
  SqlServerQueryParameter
} from '../../types.js';

type SqlServerConnectionInput = SqlServerConnectionConfig | SqlConfig;

class SQLServerV1 {
  private readonly defaultConnectionKey = 'default';
  private static readonly connections = new Map<string, { pool: ConnectionPool; config: SqlConfig }>();

  async connect(config: SqlServerConnectionInput, connectionKey?: string): Promise<ConnectionPool | undefined> {
    const key = this.getConnectionKey(connectionKey);
    if (SQLServerV1.connections.has(key)) {
      await this.disconnect(key);
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

    try {
      const pool = await new sql.ConnectionPool(normalizedConfig).connect();
      SQLServerV1.connections.set(key, { pool, config: normalizedConfig });
      console.log('Connected to SQL Server successfully');
      return pool;
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

  async disconnect(connectionKey?: string): Promise<void> {
    const key = this.getConnectionKey(connectionKey);
    const state = SQLServerV1.connections.get(key);

    if (!state) {
      console.warn('Not connected to SQL Server');
      return;
    }

    try {
      await state.pool.close();
      console.log('Disconnected from SQL Server successfully');
    } catch (error: unknown) {
      console.error('Error disconnecting from SQL Server:', error);
      throw error;
    } finally {
      SQLServerV1.connections.delete(key);
    }
  }

  async executeQuery(
    query: string,
    params: readonly SqlServerQueryParameter[] = [],
    connectionKey?: string
  ): Promise<QueryRows> {
    const state = SQLServerV1.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('Not connected to SQL Server.');
    }

    try {
      const request = state.pool.request();

      for (const parameter of params) {
        request.input(parameter.name, parameter.type, parameter.value);
      }

      const result: IResult<Record<string, unknown>> = await request.query(query);
      return (result.recordset ?? []) as QueryRows;
    } catch (error: unknown) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  async executeQueryWithColumns(
    query: string,
    params: readonly SqlServerQueryParameter[] = [],
    connectionKey?: string
  ): Promise<QueryRowsWithColumns> {
    const state = SQLServerV1.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('Not connected to SQL Server.');
    }

    try {
      const request = state.pool.request();
      request.arrayRowMode = true;

      for (const parameter of params) {
        request.input(parameter.name, parameter.type, parameter.value);
      }

      const result = await request.query(query) as unknown as {
        recordset?: unknown[][];
        columns?: Array<Array<{ name?: unknown }>>;
      };
      const rawColumns = result.columns?.[0] ?? [];
      const columnNames = rawColumns.map((column, index) => {
        const name = String(column?.name ?? '');
        return name || `Column ${index + 1}`;
      });
      const uniqueColumnNames = this.makeUniqueColumnNames(columnNames);
      const rows = (result.recordset ?? []).map((values) =>
        Object.fromEntries(
          uniqueColumnNames.map((column, index) => [column, values[index]])
        )
      ) as QueryRows;

      return {
        rows,
        columns: uniqueColumnNames
      };
    } catch (error: unknown) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  getStatus(connectionKey?: string): ConnectionStatus {
    return SQLServerV1.connections.has(this.getConnectionKey(connectionKey)) ? 'connected' : 'disconnected';
  }

  getConfig(connectionKey?: string): SqlConfig {
    const state = SQLServerV1.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('No configuration available');
    }

    return state.config;
  }

  private getConnectionKey(connectionKey?: string): string {
    return connectionKey || this.defaultConnectionKey;
  }

  private makeUniqueColumnNames(columnNames: readonly string[]): string[] {
    const reservedNames = new Set(columnNames);
    const usedNames = new Set<string>();
    const occurrences = new Map<string, number>();

    return columnNames.map((columnName) => {
      const occurrence = (occurrences.get(columnName) ?? 0) + 1;
      occurrences.set(columnName, occurrence);

      if (!usedNames.has(columnName)) {
        usedNames.add(columnName);
        return columnName;
      }

      let suffix = occurrence;
      let uniqueName = `${columnName} (${suffix})`;

      while (usedNames.has(uniqueName) || reservedNames.has(uniqueName)) {
        suffix += 1;
        uniqueName = `${columnName} (${suffix})`;
      }

      usedNames.add(uniqueName);
      return uniqueName;
    });
  }
}

export default SQLServerV1;
