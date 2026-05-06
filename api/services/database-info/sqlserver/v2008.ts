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
type TableLikeObjectRow = QueryRow & {
  object_id: number | string;
  schema_name: string;
  name: string;
  object_type: 'table' | 'view';
};

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

      const object = await this.resolveTableLikeObject(tableName, selectedSchema.schema, connectionKey);
      if (!object) {
        return { success: true, data: [] };
      }

      const columns = await this.loadObjectColumns(object, connectionKey);

      return {
        success: true,
        data: columns.map((column) => this.toColumnMetadata(column, object.object_type))
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
          INNER JOIN sys.objects o ON i.object_id = o.object_id
          INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
          LEFT JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
          LEFT JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
          WHERE s.name = @schemaName
            AND o.name = @tableName
            AND o.type IN ('U', 'V')
            AND i.index_id > 0
            AND i.name IS NOT NULL
          ORDER BY i.name, ic.key_ordinal
        `,
        [
          { name: 'tableName', type: sql.NVarChar, value: tableName },
          { name: 'schemaName', type: sql.NVarChar, value: selectedSchema.schema }
        ],
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

      const object = await this.resolveTableLikeObject(tableName, selectedSchema.schema, connectionKey);
      if (!object) {
        return { success: true, ddl: '' };
      }

      if (object.object_type === 'view') {
        const rows = (await this.db.executeQuery(
          `
            SELECT m.definition AS ddl
            FROM sys.sql_modules m
            INNER JOIN sys.objects o ON o.object_id = m.object_id
            WHERE o.object_id = @objectId
              AND o.type = 'V'
          `,
          [{ name: 'objectId', type: sql.Int, value: Number(object.object_id) }],
          connectionKey
        )) as QueryRow[];

        return {
          success: true,
          ddl: this.formatSQLServerViewDDL(object, String(rows[0]?.['ddl'] || ''))
        };
      }

      const columns = (await this.loadObjectColumns(object, connectionKey)) as QueryRow[];
      const columnLines = columns.map((column) => {
        const type = this.formatSQLServerColumnType(column);
        const nullable = this.isSQLServerNullable(column['is_nullable']) ? ' NULL' : ' NOT NULL';
        const defaultValue = column['column_default'] ? ` DEFAULT ${String(column['column_default'])}` : '';
        return `  ${quoteIdentifier(String(column['name']))} ${type}${defaultValue}${nullable}`;
      });
      const ddl = `CREATE TABLE ${quoteIdentifier(object.schema_name)}.${quoteIdentifier(object.name)} (\n${columnLines.join(',\n')}\n);`;

      return { success: true, ddl };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while loading table DDL.',
        error: getErrorMessage(error)
      };
    }
  }

  async procedureDDL(procedureName: string, connectionKey?: string): Promise<TableDDLResult> {
    try {
      const selectedSchema = await SSSQLServerV1.getSelectedSchema(connectionKey);
      if (!selectedSchema.success) {
        throw new Error(selectedSchema.message);
      }

      const parameters: SqlServerQueryParameter[] = [
        { name: 'procedureName', type: sql.NVarChar, value: procedureName },
        { name: 'schemaName', type: sql.NVarChar, value: selectedSchema.schema }
      ];
      const rows = (await this.db.executeQuery(
        `
          SELECT m.definition AS ddl
          FROM sys.sql_modules m
          INNER JOIN sys.objects o ON o.object_id = m.object_id
          INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
          WHERE s.name = @schemaName
            AND o.name = @procedureName
            AND o.type IN ('P', 'PC', 'FN', 'IF', 'TF', 'FS', 'FT')
        `,
        parameters,
        connectionKey
      )) as QueryRow[];
      const ddl = String(rows[0]?.['ddl'] || '');

      return { success: true, ddl };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while loading procedure DDL.',
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

  private async resolveTableLikeObject(
    tableName: string,
    schemaName: string,
    connectionKey?: string
  ): Promise<TableLikeObjectRow | null> {
    const rows = (await this.db.executeQuery(
      `
        SELECT
          o.object_id,
          s.name AS schema_name,
          o.name,
          CASE WHEN o.type = 'V' THEN 'view' ELSE 'table' END AS object_type
        FROM sys.objects o
        INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
        WHERE s.name = @schemaName
          AND o.name = @tableName
          AND o.type IN ('U', 'V')
        ORDER BY CASE WHEN o.type = 'U' THEN 0 ELSE 1 END
      `,
      [
        { name: 'tableName', type: sql.NVarChar, value: tableName },
        { name: 'schemaName', type: sql.NVarChar, value: schemaName }
      ],
      connectionKey
    )) as TableLikeObjectRow[];

    return rows[0] || null;
  }

  private async loadObjectColumns(object: TableLikeObjectRow, connectionKey?: string): Promise<ColumnRow[]> {
    return (await this.db.executeQuery(
      `
        SELECT
          c.name AS name,
          t.name AS data_type,
          CASE
            WHEN t.name IN ('nchar', 'nvarchar') AND c.max_length > 0 THEN c.max_length / 2
            ELSE c.max_length
          END AS character_maximum_length,
          c.precision AS numeric_precision,
          c.scale AS numeric_scale,
          c.is_nullable,
          dc.definition AS column_default,
          c.collation_name,
          c.is_identity,
          c.is_computed,
          cc.definition AS computed_definition,
          ep.value AS description,
          c.column_id AS ordinal_position
        FROM sys.columns c
        INNER JOIN sys.types t ON t.user_type_id = c.user_type_id
        LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
        LEFT JOIN sys.computed_columns cc
          ON cc.object_id = c.object_id
          AND cc.column_id = c.column_id
        LEFT JOIN sys.extended_properties ep
          ON ep.major_id = c.object_id
          AND ep.minor_id = c.column_id
          AND ep.name = 'MS_Description'
        WHERE c.object_id = @objectId
        ORDER BY c.column_id
      `,
      [{ name: 'objectId', type: sql.Int, value: Number(object.object_id) }],
      connectionKey
    )) as ColumnRow[];
  }

  private toColumnMetadata(column: QueryRow, objectType: TableLikeObjectRow['object_type']): TableColumn {
    return {
      name: String(column['name'] || ''),
      type: this.formatSQLServerColumnType(column),
      data_type: column['data_type'],
      character_maximum_length: column['character_maximum_length'],
      numeric_precision: column['numeric_precision'],
      numeric_scale: column['numeric_scale'],
      is_nullable: column['is_nullable'],
      column_default: column['column_default'],
      collation_name: column['collation_name'],
      is_identity: column['is_identity'],
      is_computed: column['is_computed'],
      computed_definition: column['computed_definition'],
      description: column['description'],
      ordinal_position: column['ordinal_position'],
      object_type: objectType
    };
  }

  private formatSQLServerViewDDL(object: TableLikeObjectRow, definition: string): string {
    const trimmed = definition.trim();
    if (!trimmed) {
      return '';
    }

    if (/^create\s+(or\s+alter\s+)?view\b/i.test(trimmed)) {
      return trimmed;
    }

    return `CREATE VIEW ${quoteIdentifier(object.schema_name)}.${quoteIdentifier(object.name)} AS\n${trimmed}`;
  }

  private isSQLServerNullable(value: QueryRow[keyof QueryRow]): boolean {
    return value === true || value === 1 || value === 'YES' || value === 'true';
  }
}

export default new ListObjectsSQLServerV1();
