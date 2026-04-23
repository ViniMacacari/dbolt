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
  private static instance: MySQLV1 | null = null;

  public connection: MySqlConnection | null = null;
  private config: MySqlConnectionOptions | null = null;

  constructor() {
    if (MySQLV1.instance) {
      return MySQLV1.instance;
    }

    MySQLV1.instance = this;
  }

  async connect(config: MySqlConnectionInput): Promise<MySqlConnection> {
    if (this.connection) {
      await this.disconnect();
    }

    this.config = {
      ...config,
      port:
        typeof config.port === 'number'
          ? config.port
          : config.port !== undefined
            ? Number.parseInt(String(config.port), 10)
            : undefined
    };

    try {
      this.connection = await mysql.createConnection(this.config);
      console.log('Connected to MySQL successfully');
      return this.connection;
    } catch (error: unknown) {
      console.error('Error connecting to MySQL:', error);
      this.connection = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connection) {
      console.warn('Not connected to MySQL');
      return;
    }

    try {
      await this.connection.end();
      console.log('Disconnected from MySQL successfully');
    } catch (error: unknown) {
      console.error('Error disconnecting from MySQL:', error);
      throw error;
    } finally {
      this.connection = null;
    }
  }

  async executeQuery(
    query: string,
    params: readonly unknown[] = []
  ): Promise<QueryRows> {
    if (!this.connection) {
      throw new Error('Not connected to MySQL.');
    }

    try {
      const [rows] = await this.connection.execute<MySqlExecutionResult>(query, [
        ...params
      ]);

      return Array.isArray(rows) ? (rows as unknown as QueryRows) : [];
    } catch (error: unknown) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  getStatus(): ConnectionStatus {
    return this.connection ? 'connected' : 'disconnected';
  }

  getConfig(): MySqlConnectionOptions {
    if (!this.config) {
      throw new Error('No configuration available');
    }

    return this.config;
  }
}

export default MySQLV1;
