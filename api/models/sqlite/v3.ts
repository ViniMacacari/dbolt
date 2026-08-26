import path from 'node:path';
import sqlite3 from 'sqlite3';

import type {
  ConnectionStatus,
  DatabaseConnectionConfig,
  QueryRows,
  QueryRowsWithColumns
} from '../../types.js';
import { columnNamesFromRows, normalizeColumnNames } from '../../utils/query-columns.js';

type SqliteConnectionConfig = Partial<DatabaseConnectionConfig> & {
  filename?: string;
};

class SQLiteV3 {
  private readonly defaultConnectionKey = 'default';
  private static readonly connections = new Map<string, { connection: sqlite3.Database; config: SqliteConnectionConfig }>();

  async connect(config: SqliteConnectionConfig, connectionKey?: string): Promise<sqlite3.Database> {
    const key = this.getConnectionKey(connectionKey);
    if (SQLiteV3.connections.has(key)) {
      await this.disconnect(key);
    }

    const normalizedConfig = this.normalizeConfig(config);

    try {
      const connection = await this.openDatabase(normalizedConfig.filename || '');
      await this.run(connection, 'PRAGMA foreign_keys = ON');
      SQLiteV3.connections.set(key, { connection, config: normalizedConfig });
      console.log('Connected to SQLite successfully');
      return connection;
    } catch (error: unknown) {
      console.error('Error connecting to SQLite:', error);
      throw error;
    }
  }

  async disconnect(connectionKey?: string): Promise<void> {
    const key = this.getConnectionKey(connectionKey);
    const state = SQLiteV3.connections.get(key);

    if (!state) {
      console.warn('Not connected to SQLite');
      return;
    }

    try {
      await this.closeDatabase(state.connection);
      console.log('Disconnected from SQLite successfully');
    } catch (error: unknown) {
      console.error('Error disconnecting from SQLite:', error);
      throw error;
    } finally {
      SQLiteV3.connections.delete(key);
    }
  }

  async executeQuery(
    query: string,
    params: readonly unknown[] = [],
    connectionKey?: string
  ): Promise<QueryRows> {
    const state = SQLiteV3.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('Not connected to SQLite.');
    }

    try {
      return await this.all(state.connection, query, [...params]) as QueryRows;
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
    const state = SQLiteV3.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('Not connected to SQLite.');
    }

    const rows = (await this.all(state.connection, query, [...params])) as QueryRows;
    if (rows.length > 0) {
      return { rows, columns: columnNamesFromRows(rows) };
    }

    return {
      rows,
      columns: params.length > 0
        ? []
        : await this.readQueryColumns(state.connection, query)
    };
  }

  getStatus(connectionKey?: string): ConnectionStatus {
    return SQLiteV3.connections.has(this.getConnectionKey(connectionKey)) ? 'connected' : 'disconnected';
  }

  getConfig(connectionKey?: string): SqliteConnectionConfig {
    const state = SQLiteV3.connections.get(this.getConnectionKey(connectionKey));
    if (!state) {
      throw new Error('No configuration available');
    }

    return state.config;
  }

  private normalizeConfig(config: SqliteConnectionConfig): SqliteConnectionConfig {
    const filename = String(config.filename || config.database || config.host || '').trim();
    if (!filename) {
      throw new Error('SQLite database file path is required.');
    }

    return {
      ...config,
      host: filename,
      database: path.basename(filename),
      filename
    };
  }

  private openDatabase(filename: string): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
      const connection = new sqlite3.Database(filename, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(connection);
      });
    });
  }

  private closeDatabase(connection: sqlite3.Database): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async readQueryColumns(connection: sqlite3.Database, query: string): Promise<string[]> {
    const statement = query.trim().replace(/;+\s*$/, '');
    if (!statement || !/^(select|with)\b/i.test(statement)) return [];

    const viewName = `dbolt_query_columns_${process.pid}`;

    try {
      await this.run(connection, `DROP VIEW IF EXISTS temp."${viewName}"`);
      await this.run(connection, `CREATE TEMP VIEW "${viewName}" AS ${statement}`);
      const columnRows = await this.all(connection, `PRAGMA temp.table_info("${viewName}")`, []);

      return normalizeColumnNames(
        (columnRows as Array<Record<string, unknown>>).map((columnRow) => columnRow['name'])
      );
    } catch (error: unknown) {
      console.warn('Unable to read SQLite query columns for an empty result.', error);
      return [];
    } finally {
      try {
        await this.run(connection, `DROP VIEW IF EXISTS temp."${viewName}"`);
      } catch (error: unknown) {
        console.warn('Unable to drop the temporary SQLite column view.', error);
      }
    }
  }

  private run(connection: sqlite3.Database, sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.run(sql, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private all(connection: sqlite3.Database, sql: string, params: unknown[]): Promise<QueryRows> {
    return new Promise((resolve, reject) => {
      connection.all(sql, params, (error, rows) => {
        if (error) {
          reject(error);
          return;
        }

        resolve((rows || []) as QueryRows);
      });
    });
  }

  private getConnectionKey(connectionKey?: string): string {
    return connectionKey || this.defaultConnectionKey;
  }
}

export default SQLiteV3;
