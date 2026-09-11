import { Client, type ClientConfig } from 'pg';

import type {
  ConnectionStatus,
  DatabaseConnectionConfig,
  QueryRows,
  QueryRowsWithColumns
} from '../../types.js';
import { normalizeColumnNames } from '../../utils/query-columns.js';
import {
  DB_CONNECT_TIMEOUT_MS,
  DB_KEEP_ALIVE_DELAY_MS,
  DB_STATEMENT_TIMEOUT_MS,
  watchConnectionFailures
} from '../../utils/database-runtime.js';

type PgConnectionInput = DatabaseConnectionConfig | ClientConfig;

class PgV1 {
  private readonly defaultConnectionKey = 'default';
  private static readonly connections = new Map<string, { connection: Client; config: ClientConfig }>();

  async connect(config: PgConnectionInput, connectionKey?: string): Promise<Client> {
    const key = this.getConnectionKey(connectionKey);
    if (PgV1.connections.has(key)) {
      await this.disconnect(key);
    }

    const normalizedConfig: ClientConfig = {
      ...config,
      port:
        typeof config.port === 'number'
          ? config.port
          : config.port !== undefined
            ? Number.parseInt(String(config.port), 10)
            : undefined,
      database: config.database ?? 'postgres',
      keepAlive: true,
      keepAliveInitialDelayMillis: DB_KEEP_ALIVE_DELAY_MS,
      connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
      ...(DB_STATEMENT_TIMEOUT_MS > 0
        ? { statement_timeout: DB_STATEMENT_TIMEOUT_MS, query_timeout: DB_STATEMENT_TIMEOUT_MS }
        : {})
    };
    const connection = new Client(normalizedConfig);

    watchConnectionFailures(connection, 'PostgreSQL', () => {
      this.dropLostConnection(key, connection);
    });

    try {
      await connection.connect();
      PgV1.connections.set(key, { connection, config: normalizedConfig });
      console.log('Connected to PostgreSQL successfully');
      return connection;
    } catch (error: unknown) {
      console.error('Error connecting to PostgreSQL:', error);
      throw error;
    }
  }

  private dropLostConnection(connectionKey: string, connection: Client): void {
    if (PgV1.connections.get(connectionKey)?.connection === connection) {
      PgV1.connections.delete(connectionKey);
    }
  }

  async disconnect(connectionKey?: string): Promise<void> {
    const key = this.getConnectionKey(connectionKey);
    const state = PgV1.connections.get(key);

    if (!state) {
      console.warn('Not connected to PostgreSQL');
      return;
    }

    try {
      await state.connection.end();
      console.log('Disconnected from PostgreSQL successfully');
    } catch (error: unknown) {
      console.error('Error disconnecting from PostgreSQL:', error);
      throw error;
    } finally {
      PgV1.connections.delete(key);
    }
  }

  async executeQuery(
    query: string,
    params: readonly unknown[] = [],
    connectionKey?: string
  ): Promise<QueryRows> {
    const state = PgV1.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('Not connected to PostgreSQL.');
    }

    try {
      const result = await state.connection.query<Record<string, unknown>>(
        query,
        [...params]
      );
      return result.rows as QueryRows;
    } catch (error: unknown) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  async executeQueryWithColumns(
    query: string,
    params: readonly unknown[] = [],
    connectionKey?: string
  ): Promise<QueryRowsWithColumns> {
    const state = PgV1.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('Not connected to PostgreSQL.');
    }

    try {
      const result = await state.connection.query<Record<string, unknown>>(
        query,
        [...params]
      );
      const lastResult = Array.isArray(result) ? result[result.length - 1] : result;

      return {
        rows: (lastResult?.rows ?? []) as QueryRows,
        columns: normalizeColumnNames((lastResult?.fields ?? []).map((field: { name?: string }) => field?.name))
      };
    } catch (error: unknown) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  getStatus(connectionKey?: string): ConnectionStatus {
    return PgV1.connections.has(this.getConnectionKey(connectionKey)) ? 'connected' : 'disconnected';
  }

  getConfig(connectionKey?: string): ClientConfig {
    const state = PgV1.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('No configuration available');
    }

    return state.config;
  }

  private getConnectionKey(connectionKey?: string): string {
    return connectionKey || this.defaultConnectionKey;
  }
}

export default PgV1;
