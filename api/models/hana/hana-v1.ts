import hana, {
  type Connection as HanaConnection,
  type HanaParameterList
} from '@sap/hana-client';

import type {
  ConnectionStatus,
  HANAStatementRow,
  HanaConnectionConfig,
  QueryRows,
  QueryRowsWithColumns
} from '../../types.js';
import { normalizeColumnNames } from '../../utils/query-columns.js';

class HanaV1 {
  private readonly defaultConnectionKey = 'default';
  private static readonly connections = new Map<string, { connection: HanaConnection; config: HanaConnectionConfig }>();

  async connect(config: HanaConnectionConfig, connectionKey?: string): Promise<HanaConnection> {
    const key = this.getConnectionKey(connectionKey);
    if (HanaV1.connections.has(key)) {
      await this.disconnect(key);
    }

    const normalizedConfig = { ...config };
    const connection = hana.createConnection();

    try {
      connection.connect(normalizedConfig);
      HanaV1.connections.set(key, { connection, config: normalizedConfig });
      console.log('Connected to HANA successfully');
      return connection;
    } catch (error: unknown) {
      console.error('Error connecting to HANA:', error);
      throw error;
    }
  }

  async disconnect(connectionKey?: string): Promise<void> {
    const key = this.getConnectionKey(connectionKey);
    const state = HanaV1.connections.get(key);

    if (!state) {
      console.warn('Not connected to HANA');
      return;
    }

    try {
      state.connection.disconnect();
      console.log('Disconnected from HANA successfully');
    } catch (error: unknown) {
      console.error('Error disconnecting from HANA:', error);
      throw error;
    } finally {
      HanaV1.connections.delete(key);
    }
  }

  async executeQuery(
    query: string,
    params: HanaParameterList = [],
    connectionKey?: string
  ): Promise<QueryRows> {
    const state = HanaV1.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('Not connected to HANA.');
    }

    try {
      const result = await new Promise<HANAStatementRow[]>((resolve, reject) => {
        const statement = state.connection.prepare(query);
        statement.exec<HANAStatementRow[]>(
          params,
          (error: Error, results?: HANAStatementRow[]) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(results ?? []);
          }
        );
      });

      return result as QueryRows;
    } catch (error: unknown) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  async executeQueryWithColumns(
    query: string,
    params: HanaParameterList = [],
    connectionKey?: string
  ): Promise<QueryRowsWithColumns> {
    const state = HanaV1.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('Not connected to HANA.');
    }

    try {
      return await new Promise<QueryRowsWithColumns>((resolve, reject) => {
        const statement = state.connection.prepare(query);
        statement.exec<HANAStatementRow[]>(
          params,
          (error: Error, results?: HANAStatementRow[]) => {
            if (error) {
              reject(error);
              return;
            }

            resolve({
              rows: (results ?? []) as QueryRows,
              columns: this.readStatementColumns(statement)
            });
          }
        );
      });
    } catch (error: unknown) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  getStatus(connectionKey?: string): ConnectionStatus {
    return HanaV1.connections.has(this.getConnectionKey(connectionKey)) ? 'connected' : 'disconnected';
  }

  getConfig(connectionKey?: string): HanaConnectionConfig {
    const state = HanaV1.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('No configuration available');
    }

    return state.config;
  }

  private readStatementColumns(statement: unknown): string[] {
    try {
      const columnInfo = (statement as { getColumnInfo?: () => unknown[] })?.getColumnInfo?.() ?? [];

      return normalizeColumnNames(
        columnInfo.map((column) => {
          const info = column as Record<string, unknown>;
          return info['columnDisplayName'] ?? info['columnName'] ?? info['name'];
        })
      );
    } catch (error: unknown) {
      console.warn('Unable to read HANA query columns.', error);
      return [];
    }
  }

  private getConnectionKey(connectionKey?: string): string {
    return connectionKey || this.defaultConnectionKey;
  }
}

export default HanaV1;
