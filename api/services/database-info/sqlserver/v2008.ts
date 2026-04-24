import sql from 'mssql';

import SQLServerV1 from '../../../models/sqlserver/v2008.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  DatabaseObject,
  DatabaseObjectsResult,
  QueryRow,
  SqlServerQueryParameter,
  TableColumn,
  TableColumnsResult
} from '../../../types.js';

type NamedObjectRow = QueryRow & { name: string };
type IndexRow = QueryRow & { index_name: string; table_name: string; index_type: string };
type ColumnRow = QueryRow & TableColumn;

class ListObjectsSQLServerV1 {
  private readonly db = new SQLServerV1();

  async listDatabaseObjects(connectionKey?: string): Promise<DatabaseObjectsResult> {
    try {
      const tables = (await this.db.executeQuery(`
        SELECT TABLE_NAME AS name, 'table' AS type
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const views = (await this.db.executeQuery(`
        SELECT TABLE_NAME AS name, 'view' AS type
        FROM INFORMATION_SCHEMA.VIEWS
        ORDER BY TABLE_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const procedures = (await this.db.executeQuery(`
        SELECT ROUTINE_NAME AS name, 'procedure' AS type
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_TYPE = 'PROCEDURE'
        ORDER BY ROUTINE_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const indexes = (await this.db.executeQuery(`
        SELECT
            i.name AS index_name,
            t.name AS table_name,
            i.type_desc AS index_type,
            'index' AS type
        FROM sys.indexes i
        INNER JOIN sys.tables t ON i.object_id = t.object_id
        WHERE i.is_primary_key = 0 AND i.is_unique_constraint = 0
        ORDER BY t.name, i.name
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
    try {
      const parameters: SqlServerQueryParameter[] = [
        { name: 'tableName', type: sql.NVarChar, value: tableName }
      ];
      const columns = (await this.db.executeQuery(
        `
          SELECT COLUMN_NAME AS name, DATA_TYPE AS type
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = @tableName
          ORDER BY ORDINAL_POSITION
        `,
        parameters,
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

export default new ListObjectsSQLServerV1();
