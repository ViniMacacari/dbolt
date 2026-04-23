import { Client, type ClientConfig } from 'pg';

import type {
  ConnectionStatus,
  DatabaseConnectionConfig,
  QueryRows
} from '../../types.js';

type PgConnectionInput = DatabaseConnectionConfig | ClientConfig;

class PgV1 {
  private static instance: PgV1 | null = null;

  public connection: Client | null = null;
  private config: ClientConfig | null = null;

  constructor() {
    if (PgV1.instance) {
      return PgV1.instance;
    }

    PgV1.instance = this;
  }

  async connect(config: PgConnectionInput): Promise<Client> {
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
            : undefined,
      database: config.database ?? 'postgres'
    };
    this.connection = new Client(this.config);

    try {
      await this.connection.connect();
      console.log('Connected to PostgreSQL successfully');
      return this.connection;
    } catch (error: unknown) {
      console.error('Error connecting to PostgreSQL:', error);
      this.connection = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connection) {
      console.warn('Not connected to PostgreSQL');
      return;
    }

    try {
      await this.connection.end();
      console.log('Disconnected from PostgreSQL successfully');
    } catch (error: unknown) {
      console.error('Error disconnecting from PostgreSQL:', error);
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
      throw new Error('Not connected to PostgreSQL.');
    }

    try {
      const result = await this.connection.query<Record<string, unknown>>(
        query,
        [...params]
      );
      return result.rows as QueryRows;
    } catch (error: unknown) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  getStatus(): ConnectionStatus {
    return this.connection ? 'connected' : 'disconnected';
  }

  getConfig(): ClientConfig {
    if (!this.config) {
      throw new Error('No configuration available');
    }

    return this.config;
  }
}

export default PgV1;
