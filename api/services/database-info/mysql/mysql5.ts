import MySQLV1 from '../../../models/mysql/mysql5.js';
import { getErrorMessage } from '../../../utils/errors.js';
import { groupDatabaseObjects, toIndexDatabaseObject, toNamedDatabaseObject } from '../../../utils/database-objects.js';
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

type NamedObjectRow = QueryRow & { name: string };
type IndexRow = QueryRow & { index_name: string; table_name: string; index_type: string };
type ColumnRow = QueryRow & TableColumn;

class ListObjectsMySQLV1 {
  private readonly db = new MySQLV1();

  async listDatabaseObjects(connectionKey?: string): Promise<DatabaseObjectsResult> {
    if (this.db.getStatus(connectionKey) !== 'connected') {
      return {
        success: false,
        message: 'No active connection. Ensure the database is connected before querying.'
      };
    }

    try {
      const tables = (await this.db.executeQuery(`
        SELECT TABLE_NAME AS name, 'table' AS type
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const views = (await this.db.executeQuery(`
        SELECT TABLE_NAME AS name, 'view' AS type
        FROM INFORMATION_SCHEMA.VIEWS
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const procedures = (await this.db.executeQuery(`
        SELECT ROUTINE_NAME AS name, 'procedure' AS type
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_SCHEMA = DATABASE()
          AND ROUTINE_TYPE = 'PROCEDURE'
        ORDER BY ROUTINE_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const indexes = (await this.db.executeQuery(`
        SELECT
            TABLE_NAME AS table_name,
            INDEX_NAME AS index_name,
            INDEX_TYPE AS index_type,
            'index' AS type
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME, INDEX_NAME
      `, [], connectionKey)) as IndexRow[];

      const data: DatabaseObject[] = [
        ...tables.map((object, index) => toNamedDatabaseObject(object, 'table', index)),
        ...views.map((object, index) => toNamedDatabaseObject(object, 'view', index)),
        ...procedures.map((object, index) => toNamedDatabaseObject(object, 'procedure', index)),
        ...indexes.map((object, index) => toIndexDatabaseObject(object, index))
      ];

      return { success: true, data, ...groupDatabaseObjects(data) };
    } catch (error: unknown) {
      console.error('Error listing database objects:', error);
      return {
        success: false,
        message: 'Error occurred while listing database objects.',
        error: getErrorMessage(error)
      };
    }
  }

  async tableColumns(tableName: string, connectionKey?: string): Promise<TableColumnsResult> {
    if (this.db.getStatus(connectionKey) !== 'connected') {
      return {
        success: false,
        message: 'No active connection. Ensure the database is connected before querying.'
      };
    }

    try {
      const columns = (await this.db.executeQuery(
        `
          SELECT COLUMN_NAME AS name, DATA_TYPE AS type
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `,
        [tableName],
        connectionKey
      )) as ColumnRow[];

      return {
        success: true,
        data: columns.map((column) => ({ name: column.name, type: column.type }))
      };
    } catch (error: unknown) {
      console.error('Error listing table columns:', error);
      return {
        success: false,
        message: 'Error occurred while listing table columns.',
        error: getErrorMessage(error)
      };
    }
  }

  async tableKeys(tableName: string, connectionKey?: string): Promise<TableMetadataRowsResult> {
    try {
      const keys = (await this.db.executeQuery(
        `
          SELECT
            tc.CONSTRAINT_NAME AS name,
            tc.CONSTRAINT_TYPE AS type,
            kcu.COLUMN_NAME AS column_name,
            kcu.ORDINAL_POSITION AS ordinal_position,
            kcu.REFERENCED_TABLE_NAME AS referenced_table,
            kcu.REFERENCED_COLUMN_NAME AS referenced_column
          FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
          INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
            ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
            AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
            AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
            AND kcu.TABLE_NAME = tc.TABLE_NAME
          WHERE tc.TABLE_SCHEMA = DATABASE()
            AND tc.TABLE_NAME = ?
          ORDER BY tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
        `,
        [tableName],
        connectionKey
      )) as QueryRow[];

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
      const indexes = (await this.db.executeQuery(
        `
          SELECT
            INDEX_NAME AS name,
            COLUMN_NAME AS column_name,
            INDEX_TYPE AS index_type,
            NON_UNIQUE AS non_unique,
            SEQ_IN_INDEX AS ordinal_position
          FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
          ORDER BY INDEX_NAME, SEQ_IN_INDEX
        `,
        [tableName],
        connectionKey
      )) as QueryRow[];

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
        `SHOW CREATE TABLE ${quoteIdentifier(tableName, '`')}`,
        [],
        connectionKey
      )) as QueryRow[];
      const ddl = String(rows[0]?.['Create Table'] || rows[0]?.['Create View'] || '');

      return { success: true, ddl };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while loading table DDL.',
        error: getErrorMessage(error)
      };
    }
  }
}

export default new ListObjectsMySQLV1();
