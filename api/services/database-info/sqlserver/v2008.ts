import sql from 'mssql';

import SQLServerV1 from '../../../models/sqlserver/v2008.js';
import SSSQLServerV1 from '../../schemas/sqlserver/v2008.js';
import { getErrorMessage } from '../../../utils/errors.js';
import { groupDatabaseObjects, toIndexDatabaseObject, toNamedDatabaseObject } from '../../../utils/database-objects.js';

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
      const selectedSchema = await SSSQLServerV1.getSelectedSchema(connectionKey);
      if (!selectedSchema.success) {
        throw new Error(selectedSchema.message);
      }

      const parameters: SqlServerQueryParameter[] = [
        { name: 'schemaName', type: sql.NVarChar, value: selectedSchema.schema }
      ];

      const tables = (await this.db.executeQuery(`
        SELECT TABLE_NAME AS name, 'table' AS type
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
          AND TABLE_SCHEMA = @schemaName
        ORDER BY TABLE_NAME
      `, parameters, connectionKey)) as NamedObjectRow[];

      const views = (await this.db.executeQuery(`
        SELECT TABLE_NAME AS name, 'view' AS type
        FROM INFORMATION_SCHEMA.VIEWS
        WHERE TABLE_SCHEMA = @schemaName
        ORDER BY TABLE_NAME
      `, parameters, connectionKey)) as NamedObjectRow[];

      const procedures = (await this.db.executeQuery(`
        SELECT ROUTINE_NAME AS name, 'procedure' AS type
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_TYPE = 'PROCEDURE'
          AND ROUTINE_SCHEMA = @schemaName
        ORDER BY ROUTINE_NAME
      `, parameters, connectionKey)) as NamedObjectRow[];

      const indexes = (await this.db.executeQuery(`
        SELECT
            i.name AS index_name,
            t.name AS table_name,
            i.type_desc AS index_type,
            'index' AS type
        FROM sys.indexes i
        INNER JOIN sys.tables t ON i.object_id = t.object_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE i.index_id > 0
          AND i.name IS NOT NULL
          AND s.name = @schemaName
        ORDER BY t.name, i.name
      `, parameters, connectionKey)) as IndexRow[];

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
    try {
      const selectedSchema = await SSSQLServerV1.getSelectedSchema(connectionKey);
      if (!selectedSchema.success) {
        throw new Error(selectedSchema.message);
      }

      const parameters: SqlServerQueryParameter[] = [
        { name: 'tableName', type: sql.NVarChar, value: tableName },
        { name: 'schemaName', type: sql.NVarChar, value: selectedSchema.schema }
      ];
      const columns = (await this.db.executeQuery(
        `
          SELECT COLUMN_NAME AS name, DATA_TYPE AS type
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = @tableName
            AND TABLE_SCHEMA = @schemaName
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
