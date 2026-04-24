import mysql, {
  type Connection as MySqlConnection,
  type ConnectionOptions as MySqlConnectionOptions,
  type OkPacket,
  type ResultSetHeader,
  type RowDataPacket
} from 'mysql2/promise';

import type {
  ConnectionStatus,
  DatabaseConnectionConfig,
  QueryRows
} from '../../types.js';

type MySqlConnectionInput = DatabaseConnectionConfig | MySqlConnectionOptions;

type MySqlExecutionResult =
  | RowDataPacket[][]
  | RowDataPacket[]
  | OkPacket
  | OkPacket[]
  | ResultSetHeader;

class MySQLV1 {
  private readonly defaultConnectionKey = 'default';
  private static readonly connections = new Map<string, { connection: MySqlConnection; config: MySqlConnectionOptions }>();

  async connect(config: MySqlConnectionInput, connectionKey?: string): Promise<MySqlConnection> {
    const key = this.getConnectionKey(connectionKey);
    if (MySQLV1.connections.has(key)) {
      await this.disconnect(key);
    }

    const normalizedConfig: MySqlConnectionOptions = {
      ...config,
      port:
        typeof config.port === 'number'
          ? config.port
          : config.port !== undefined
            ? Number.parseInt(String(config.port), 10)
            : undefined
    };

    try {
      const connection = await mysql.createConnection(normalizedConfig);
      MySQLV1.connections.set(key, { connection, config: normalizedConfig });
      console.log('Connected to MySQL successfully');
      return connection;
    } catch (error: unknown) {
      console.error('Error connecting to MySQL:', error);
      throw error;
    }
  }

  async disconnect(connectionKey?: string): Promise<void> {
    const key = this.getConnectionKey(connectionKey);
    const state = MySQLV1.connections.get(key);

    if (!state) {
      console.warn('Not connected to MySQL');
      return;
    }

    try {
      await state.connection.end();
      console.log('Disconnected from MySQL successfully');
    } catch (error: unknown) {
      console.error('Error disconnecting from MySQL:', error);
      throw error;
    } finally {
      MySQLV1.connections.delete(key);
    }
  }

  async executeQuery(
    query: string,
    params: readonly unknown[] = [],
    connectionKey?: string
  ): Promise<QueryRows> {
    const state = MySQLV1.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('Not connected to MySQL.');
    }

    try {
      const [rows] = await state.connection.execute<MySqlExecutionResult>(query, [
        ...params
      ]);

      return Array.isArray(rows) ? (rows as unknown as QueryRows) : [];
    } catch (error: unknown) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  getStatus(connectionKey?: string): ConnectionStatus {
    return MySQLV1.connections.has(this.getConnectionKey(connectionKey)) ? 'connected' : 'disconnected';
  }

  getConfig(connectionKey?: string): MySqlConnectionOptions {
    const state = MySQLV1.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('No configuration available');
    }

    return state.config;
  }

  private getConnectionKey(connectionKey?: string): string {
    return connectionKey || this.defaultConnectionKey;
  }
}

export default MySQLV1;
