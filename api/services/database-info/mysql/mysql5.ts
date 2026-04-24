import MySQLV1 from '../../../models/mysql/mysql5.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  DatabaseObject,
  DatabaseObjectsResult,
  QueryRow,
  TableColumn,
  TableColumnsResult
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
        ...tables.map((object) => ({ name: object.name, type: 'table' as const })),
        ...views.map((object) => ({ name: object.name, type: 'view' as const })),
        ...procedures.map((object) => ({
          name: object.name,
          type: 'procedure' as const
        })),
        ...indexes.map((object) => ({
          name: object.index_name,
          table: object.table_name,
          index_type: object.index_type,
          type: 'index' as const
        }))
      ];

      return { success: true, data };
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
}

export default new ListObjectsMySQLV1();
