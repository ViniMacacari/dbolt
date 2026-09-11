import hana, {
  type Connection as HanaConnection,
  type HanaParameterList,
  type Statement as HanaStatement
} from '@sap/hana-client';

import type {
  ConnectionStatus,
  HANAStatementRow,
  HanaConnectionConfig,
  QueryRows,
  QueryRowsWithColumns
} from '../../types.js';
import { normalizeColumnNames } from '../../utils/query-columns.js';
import { DB_CONNECT_TIMEOUT_MS } from '../../utils/database-runtime.js';

class HanaV1 {
  private readonly defaultConnectionKey = 'default';
  private static readonly connections = new Map<string, { connection: HanaConnection; config: HanaConnectionConfig }>();

  async connect(config: HanaConnectionConfig, connectionKey?: string): Promise<HanaConnection> {
    const key = this.getConnectionKey(connectionKey);
    if (HanaV1.connections.has(key)) {
      await this.disconnect(key);
    }

    const normalizedConfig: HanaConnectionConfig = {
      CONNECTTIMEOUT: DB_CONNECT_TIMEOUT_MS,
      ...config
    };
    const connection = hana.createConnection();

    try {
      await this.openConnection(connection, normalizedConfig);
      HanaV1.connections.set(key, { connection, config: normalizedConfig });
      console.log('Connected to HANA successfully');
      return connection;
    } catch (error: unknown) {
      console.error('Error connecting to HANA:', error);
      this.closeConnection(connection).catch(() => undefined);
      throw error;
    }
  }

  private openConnection(
    connection: HanaConnection,
    config: HanaConnectionConfig
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.connect(config, (error: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private closeConnection(connection: HanaConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.disconnect((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async disconnect(connectionKey?: string): Promise<void> {
    const key = this.getConnectionKey(connectionKey);
    const state = HanaV1.connections.get(key);

    if (!state) {
      console.warn('Not connected to HANA');
      return;
    }

    try {
      await this.closeConnection(state.connection);
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
      const { rows } = await this.runStatement(state.connection, query, params);
      return rows;
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
      return await this.runStatement(state.connection, query, params);
    } catch (error: unknown) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  /**
   * `prepare` and `exec` both reach the server. The synchronous overloads block
   * the event loop for the whole round trip, which freezes the Electron window
   * on slow links, so only the callback based overloads are used here.
   */
  private prepareStatement(connection: HanaConnection, query: string): Promise<HanaStatement> {
    return new Promise((resolve, reject) => {
      connection.prepare(query, (error: Error, statement?: HanaStatement) => {
        if (error) {
          reject(error);
          return;
        }

        if (!statement) {
          reject(new Error('HANA did not return a prepared statement.'));
          return;
        }

        resolve(statement);
      });
    });
  }

  private async runStatement(
    connection: HanaConnection,
    query: string,
    params: HanaParameterList
  ): Promise<QueryRowsWithColumns> {
    const statement = await this.prepareStatement(connection, query);

    try {
      const rows = await new Promise<HANAStatementRow[]>((resolve, reject) => {
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

      return {
        rows: rows as QueryRows,
        columns: this.readStatementColumns(statement)
      };
    } finally {
      this.dropStatement(statement);
    }
  }

  private dropStatement(statement: HanaStatement): void {
    try {
      statement.drop((error?: Error) => {
        if (error) {
          console.warn('Unable to release a HANA prepared statement.', error);
        }
      });
    } catch (error: unknown) {
      console.warn('Unable to release a HANA prepared statement.', error);
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
