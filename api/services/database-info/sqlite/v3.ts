import SQLiteV3 from '../../../models/sqlite/v3.js';
import { groupDatabaseObjects, toIndexDatabaseObject, toNamedDatabaseObject } from '../../../utils/database-objects.js';
import { getErrorMessage } from '../../../utils/errors.js';
import { quoteIdentifier } from '../../../utils/sql-identifiers.js';

import type {
  DatabaseObject,
  DatabaseObjectsResult,
  QueryRow,
  TableColumn,
  TableColumnsResult,
  TableDDLResult,
  TableMetadataRowsResult
} from '../../../types.js';

type NamedObjectRow = QueryRow & { name: string; type: 'table' | 'view' };
type IndexRow = QueryRow & { index_name: string; table_name: string; index_type: string };
type ColumnRow = QueryRow & TableColumn;

class ListObjectsSQLiteV3 {
  private readonly db = new SQLiteV3();

  async listDatabaseObjects(connectionKey?: string): Promise<DatabaseObjectsResult> {
    if (this.db.getStatus(connectionKey) !== 'connected') {
      return {
        success: false,
        message: 'No active connection. Ensure the database is connected before querying.'
      };
    }

    try {
      const objects = (await this.db.executeQuery(`
        SELECT name, type
        FROM sqlite_master
        WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `, [], connectionKey)) as NamedObjectRow[];

      const indexes = (await this.db.executeQuery(`
        SELECT
          name AS index_name,
          tbl_name AS table_name,
          'BTREE' AS index_type,
          'index' AS type
        FROM sqlite_master
        WHERE type = 'index'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY tbl_name, name
      `, [], connectionKey)) as IndexRow[];

      const data: DatabaseObject[] = [
        ...objects.map((object, index) =>
          toNamedDatabaseObject(object, object.type === 'view' ? 'view' : 'table', index)
        ),
        ...indexes.map((object, index) => toIndexDatabaseObject(object, index))
      ];

      return { success: true, data, ...groupDatabaseObjects(data) };
    } catch (error: unknown) {
      console.error('Error listing SQLite database objects:', error);
      return {
        success: false,
        message: 'Error occurred while listing database objects.',
        error: getErrorMessage(error)
      };
    }
  }

  async listTableObjects(connectionKey?: string): Promise<DatabaseObjectsResult> {
    if (this.db.getStatus(connectionKey) !== 'connected') {
      return {
        success: false,
        message: 'No active connection. Ensure the database is connected before querying.'
      };
    }

    try {
      const objects = (await this.db.executeQuery(`
        SELECT name, type
        FROM sqlite_master
        WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `, [], connectionKey)) as NamedObjectRow[];

      const data: DatabaseObject[] = objects.map((object, index) =>
        toNamedDatabaseObject(object, object.type === 'view' ? 'view' : 'table', index)
      );

      return { success: true, data, ...groupDatabaseObjects(data) };
    } catch (error: unknown) {
      console.error('Error listing SQLite table objects:', error);
      return {
        success: false,
        message: 'Error occurred while listing table objects.',
        error: getErrorMessage(error)
      };
    }
  }

  async tableColumns(tableName: string, connectionKey?: string): Promise<TableColumnsResult> {
    try {
      const columns = (await this.db.executeQuery(
        `PRAGMA table_info(${quoteIdentifier(tableName)})`,
        [],
        connectionKey
      )) as (QueryRow & { name: string; type: string })[];

      return {
        success: true,
        data: columns.map((column) => ({ name: column.name, type: column.type || 'TEXT' }) as ColumnRow)
      };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while listing table columns.',
        error: getErrorMessage(error)
      };
    }
  }

  async tableKeys(tableName: string, connectionKey?: string): Promise<TableMetadataRowsResult> {
    try {
      const columns = (await this.db.executeQuery(
        `PRAGMA table_info(${quoteIdentifier(tableName)})`,
        [],
        connectionKey
      )) as QueryRow[];

      const keys = columns
        .filter((column) => Number(column['pk']) > 0)
        .map((column) => ({
          name: 'PRIMARY',
          type: 'PRIMARY KEY',
          column_name: column['name'],
          ordinal_position: column['pk']
        }));

      return { success: true, data: keys };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while listing table keys.',
        error: getErrorMessage(error)
      };
    }
  }

  async tableIndexes(tableName: string, connectionKey?: string): Promise<TableMetadataRowsResult> {
    try {
      const indexList = (await this.db.executeQuery(
        `PRAGMA index_list(${quoteIdentifier(tableName)})`,
        [],
        connectionKey
      )) as QueryRow[];
      const indexes: QueryRow[] = [];

      for (const indexRow of indexList) {
        const indexName = String(indexRow['name'] || '');
        if (!indexName) continue;

        const indexColumns = (await this.db.executeQuery(
          `PRAGMA index_info(${quoteIdentifier(indexName)})`,
          [],
          connectionKey
        )) as QueryRow[];

        indexColumns.forEach((column) => {
          indexes.push({
            name: indexName,
            column_name: column['name'],
            unique: indexRow['unique'],
            origin: indexRow['origin'],
            ordinal_position: column['seqno']
          });
        });
      }

      return { success: true, data: indexes };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while listing table indexes.',
        error: getErrorMessage(error)
      };
    }
  }

  async tableDDL(tableName: string, connectionKey?: string): Promise<TableDDLResult> {
    try {
      const rows = (await this.db.executeQuery(
        `
          SELECT sql
          FROM sqlite_master
          WHERE type IN ('table', 'view')
            AND name = ?
          LIMIT 1
        `,
        [tableName],
        connectionKey
      )) as QueryRow[];

      return { success: true, ddl: String(rows[0]?.['sql'] || '') };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while loading table DDL.',
        error: getErrorMessage(error)
      };
    }
  }

  async procedureDDL(_procedureName: string, _connectionKey?: string): Promise<TableDDLResult> {
    return {
      success: false,
      message: 'SQLite does not support stored procedures.'
    };
  }
}

export default new ListObjectsSQLiteV3();
