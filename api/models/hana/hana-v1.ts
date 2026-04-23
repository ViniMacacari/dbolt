import hana, {
  type Connection as HanaConnection,
  type HanaParameterList
} from '@sap/hana-client';

import type {
  ConnectionStatus,
  HANAStatementRow,
  HanaConnectionConfig,
  QueryRows
} from '../../types.js';

class HanaV1 {
  private static instance: HanaV1 | null = null;

  public connection: HanaConnection | null = null;
  private config: HanaConnectionConfig | null = null;

  constructor() {
    if (HanaV1.instance) {
      return HanaV1.instance;
    }

    HanaV1.instance = this;
  }

  async connect(config: HanaConnectionConfig): Promise<HanaConnection> {
    if (this.connection) {
      await this.disconnect();
    }

    this.config = { ...config };
    this.connection = hana.createConnection();

    try {
      this.connection.connect(config);
      console.log('Connected to HANA successfully');
      return this.connection;
    } catch (error: unknown) {
      console.error('Error connecting to HANA:', error);
      this.connection = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connection) {
      console.warn('Not connected to HANA');
      return;
    }

    try {
      this.connection.disconnect();
      console.log('Disconnected from HANA successfully');
    } catch (error: unknown) {
      console.error('Error disconnecting from HANA:', error);
      throw error;
    } finally {
      this.connection = null;
      this.config = null;
    }
  }

  async executeQuery(
    query: string,
    params: HanaParameterList = []
  ): Promise<QueryRows> {
    if (!this.connection) {
      throw new Error('Not connected to HANA.');
    }

    try {
      const result = await new Promise<HANAStatementRow[]>((resolve, reject) => {
        const statement = this.connection!.prepare(query);
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

  getStatus(): ConnectionStatus {
    return this.connection ? 'connected' : 'disconnected';
  }

  getConfig(): HanaConnectionConfig {
    if (!this.config) {
      throw new Error('No configuration available');
    }

    return this.config;
  }
}

export default HanaV1;
