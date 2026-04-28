import sql from 'mssql';

import SQLServerV1 from '../../../models/sqlserver/v2008.js';
import SSSQLServerV1 from '../../schemas/sqlserver/v2008.js';
import { getErrorMessage } from '../../../utils/errors.js';
import { groupDatabaseObjects, toIndexDatabaseObject, toNamedDatabaseObject } from '../../../utils/database-objects.js';
import { quoteIdentifier } from '../../../utils/sql-identifiers.js';

import type {
  DatabaseObject,
  DatabaseObjectsResult,
  QueryRow,
  SqlServerQueryParameter,
  TableColumn,
  TableColumnsResult,
  TableDDLResult,
  TableMetadataRowsResult
} from '../../../types.js';

type NamedObjectRow = QueryRow & { name: string; type: 'table' | 'view' | 'procedure' };
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

  async listTableObjects(connectionKey?: string): Promise<DatabaseObjectsResult> {
    try {
      const selectedSchema = await SSSQLServerV1.getSelectedSchema(connectionKey);
      if (!selectedSchema.success) {
        throw new Error(selectedSchema.message);
      }

      const parameters: SqlServerQueryParameter[] = [
        { name: 'schemaName', type: sql.NVarChar, value: selectedSchema.schema }
      ];

      const objects = (await this.db.executeQuery(`
        SELECT name, type
        FROM (
          SELECT TABLE_NAME AS name, 'table' AS type
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_TYPE = 'BASE TABLE'
            AND TABLE_SCHEMA = @schemaName
          UNION ALL
          SELECT TABLE_NAME AS name, 'view' AS type
          FROM INFORMATION_SCHEMA.VIEWS
          WHERE TABLE_SCHEMA = @schemaName
        ) objects
        ORDER BY name
      `, parameters, connectionKey)) as NamedObjectRow[];

      const data: DatabaseObject[] = objects.map((object, index) =>
        toNamedDatabaseObject(object, object.type === 'view' ? 'view' : 'table', index)
      );

      return { success: true, data, ...groupDatabaseObjects(data) };
    } catch (error: unknown) {
      console.error('Error listing table objects:', error);
      return {
        success: false,
        message: 'Error occurred while listing table objects.',
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

  async tableKeys(tableName: string, connectionKey?: string): Promise<TableMetadataRowsResult> {
    try {
      const selectedSchema = await SSSQLServerV1.getSelectedSchema(connectionKey);
      if (!selectedSchema.success) {
        throw new Error(selectedSchema.message);
      }

      const parameters: SqlServerQueryParameter[] = [
        { name: 'tableName', type: sql.NVarChar, value: tableName },
        { name: 'schemaName', type: sql.NVarChar, value: selectedSchema.schema }
      ];
      const keys = (await this.db.executeQuery(
        `
          SELECT
            tc.CONSTRAINT_NAME AS name,
            tc.CONSTRAINT_TYPE AS type,
            kcu.COLUMN_NAME AS column_name,
            kcu.ORDINAL_POSITION AS ordinal_position
          FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
          LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
            ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
            AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
            AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
            AND kcu.TABLE_NAME = tc.TABLE_NAME
          WHERE tc.TABLE_SCHEMA = @schemaName
            AND tc.TABLE_NAME = @tableName
          ORDER BY tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
        `,
        parameters,
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
      const selectedSchema = await SSSQLServerV1.getSelectedSchema(connectionKey);
      if (!selectedSchema.success) {
        throw new Error(selectedSchema.message);
      }

      const parameters: SqlServerQueryParameter[] = [
        { name: 'tableName', type: sql.NVarChar, value: tableName },
        { name: 'schemaName', type: sql.NVarChar, value: selectedSchema.schema }
      ];
      const indexes = (await this.db.executeQuery(
        `
          SELECT
            i.name AS name,
            i.type_desc AS index_type,
            i.is_unique,
            i.is_primary_key,
            c.name AS column_name,
            ic.key_ordinal AS ordinal_position
          FROM sys.indexes i
          INNER JOIN sys.tables t ON i.object_id = t.object_id
          INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
          LEFT JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
          LEFT JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
          WHERE s.name = @schemaName
            AND t.name = @tableName
            AND i.index_id > 0
            AND i.name IS NOT NULL
          ORDER BY i.name, ic.key_ordinal
        `,
        parameters,
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
          SELECT
            COLUMN_NAME AS column_name,
            DATA_TYPE AS data_type,
            CHARACTER_MAXIMUM_LENGTH AS character_maximum_length,
            NUMERIC_PRECISION AS numeric_precision,
            NUMERIC_SCALE AS numeric_scale,
            IS_NULLABLE AS is_nullable,
            COLUMN_DEFAULT AS column_default
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = @schemaName
            AND TABLE_NAME = @tableName
          ORDER BY ORDINAL_POSITION
        `,
        parameters,
        connectionKey
      )) as QueryRow[];
      const columnLines = columns.map((column) => {
        const type = this.formatSQLServerColumnType(column);
        const nullable = column['is_nullable'] === 'NO' ? ' NOT NULL' : ' NULL';
        const defaultValue = column['column_default'] ? ` DEFAULT ${String(column['column_default'])}` : '';
        return `  ${quoteIdentifier(String(column['column_name']))} ${type}${defaultValue}${nullable}`;
      });
      const ddl = `CREATE TABLE ${quoteIdentifier(selectedSchema.schema)}.${quoteIdentifier(tableName)} (\n${columnLines.join(',\n')}\n);`;

      return { success: true, ddl };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while loading table DDL.',
        error: getErrorMessage(error)
      };
    }
  }

  private formatSQLServerColumnType(column: QueryRow): string {
    const dataType = String(column['data_type'] || '');
    const characterLength = column['character_maximum_length'];
    if (characterLength && ['char', 'varchar', 'nchar', 'nvarchar', 'binary', 'varbinary'].includes(dataType)) {
      return `${dataType}(${Number(characterLength) === -1 ? 'MAX' : characterLength})`;
    }

    if (column['numeric_precision'] && ['decimal', 'numeric'].includes(dataType)) {
      return `${dataType}(${column['numeric_precision']}, ${column['numeric_scale'] || 0})`;
    }

    return dataType;
  }
}

export default new ListObjectsSQLServerV1();
