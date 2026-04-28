import HanaV1 from '../../../models/hana/hana-v1.js';
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

type NamedObjectRow = QueryRow & { name: string; type: 'table' | 'view' | 'procedure' };
type IndexRow = QueryRow & { index_name: string; table_name: string; index_type?: string };
type ColumnRow = QueryRow & TableColumn;

class ListObjectsHanaV1 {
  private readonly db = new HanaV1();
  private readonly maxBuilderObjects = 5000;

  async listDatabaseObjects(connectionKey?: string): Promise<DatabaseObjectsResult> {
    try {
      const tables = (await this.db.executeQuery(`
        SELECT TABLE_NAME AS "name", 'table' AS "type"
        FROM PUBLIC.TABLES
        WHERE SCHEMA_NAME = CURRENT_SCHEMA
        ORDER BY TABLE_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const views = (await this.db.executeQuery(`
        SELECT VIEW_NAME AS "name", 'view' AS "type"
        FROM PUBLIC.VIEWS
        WHERE SCHEMA_NAME = CURRENT_SCHEMA
        ORDER BY VIEW_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const procedures = (await this.db.executeQuery(`
        SELECT PROCEDURE_NAME AS "name", 'procedure' AS "type"
        FROM PUBLIC.PROCEDURES
        WHERE SCHEMA_NAME = CURRENT_SCHEMA
        ORDER BY PROCEDURE_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const indexes = await this.listIndexes(connectionKey);

      const data: DatabaseObject[] = [
        ...tables.map((object, index) => toNamedDatabaseObject(object, 'table', index)),
        ...views.map((object, index) => toNamedDatabaseObject(object, 'view', index)),
        ...procedures.map((object, index) => toNamedDatabaseObject(object, 'procedure', index)),
        ...indexes.map((object, index) => toIndexDatabaseObject(object, index))
      ];

      return { success: true, data, ...groupDatabaseObjects(data) };
    } catch (error: unknown) {
      console.error('Error listing database objects in HANA:', error);
      return {
        success: false,
        message: 'Error occurred while listing database objects.',
        error: getErrorMessage(error)
      };
    }
  }

  async listTableObjects(connectionKey?: string): Promise<DatabaseObjectsResult> {
    try {
      const objects = (await this.db.executeQuery(`
        SELECT "name", "type"
        FROM (
          SELECT TABLE_NAME AS "name", 'table' AS "type"
          FROM PUBLIC.TABLES
          WHERE SCHEMA_NAME = CURRENT_SCHEMA
          UNION ALL
          SELECT VIEW_NAME AS "name", 'view' AS "type"
          FROM PUBLIC.VIEWS
          WHERE SCHEMA_NAME = CURRENT_SCHEMA
        ) objects
        ORDER BY "name"
        LIMIT ${this.maxBuilderObjects}
      `, [], connectionKey)) as NamedObjectRow[];

      const data: DatabaseObject[] = objects.map((object, index) =>
        toNamedDatabaseObject(object, object.type === 'view' ? 'view' : 'table', index)
      );

      return { success: true, data, ...groupDatabaseObjects(data) };
    } catch (error: unknown) {
      console.error('Error listing table objects in HANA:', error);
      return {
        success: false,
        message: 'Error occurred while listing table objects.',
        error: getErrorMessage(error)
      };
    }
  }

  async tableColumns(tableName: string, connectionKey?: string): Promise<TableColumnsResult> {
    try {
      const columns = (await this.db.executeQuery(`
        SELECT COLUMN_NAME AS "name", DATA_TYPE_NAME AS "type"
        FROM SYS.TABLE_COLUMNS
        WHERE SCHEMA_NAME = CURRENT_SCHEMA
          AND TABLE_NAME = ?
        ORDER BY POSITION
      `, [tableName.toUpperCase()], connectionKey)) as ColumnRow[];

      return {
        success: true,
        data: columns.map((column) => ({ name: column.name, type: column.type }))
      };
    } catch (error: unknown) {
      console.error('Error listing table columns in HANA:', error);
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
            c.CONSTRAINT_NAME AS "name",
            CASE
              WHEN c.IS_PRIMARY_KEY = 'TRUE' THEN 'PRIMARY KEY'
              WHEN c.IS_UNIQUE_KEY = 'TRUE' THEN 'UNIQUE'
              ELSE c.CONSTRAINT_TYPE
            END AS "type",
            cc.COLUMN_NAME AS "column_name",
            cc.POSITION AS "ordinal_position"
          FROM SYS.CONSTRAINTS c
          LEFT JOIN SYS.CONSTRAINT_COLUMNS cc
            ON cc.SCHEMA_NAME = c.SCHEMA_NAME
            AND cc.TABLE_NAME = c.TABLE_NAME
            AND cc.CONSTRAINT_NAME = c.CONSTRAINT_NAME
          WHERE c.SCHEMA_NAME = CURRENT_SCHEMA
            AND c.TABLE_NAME = ?
          ORDER BY c.CONSTRAINT_NAME, cc.POSITION
        `,
        [tableName.toUpperCase()],
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
            i.INDEX_NAME AS "name",
            i.INDEX_TYPE AS "index_type",
            ic.COLUMN_NAME AS "column_name",
            ic.POSITION AS "ordinal_position"
          FROM SYS.INDEXES i
          LEFT JOIN SYS.INDEX_COLUMNS ic
            ON ic.SCHEMA_NAME = i.SCHEMA_NAME
            AND ic.TABLE_NAME = i.TABLE_NAME
            AND ic.INDEX_NAME = i.INDEX_NAME
          WHERE i.SCHEMA_NAME = CURRENT_SCHEMA
            AND i.TABLE_NAME = ?
            AND i.INDEX_NAME IS NOT NULL
          ORDER BY i.INDEX_NAME, ic.POSITION
        `,
        [tableName.toUpperCase()],
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
      const columns = (await this.db.executeQuery(
        `
          SELECT
            COLUMN_NAME AS "column_name",
            DATA_TYPE_NAME AS "data_type",
            LENGTH AS "length",
            SCALE AS "scale",
            IS_NULLABLE AS "is_nullable",
            DEFAULT_VALUE AS "default_value"
          FROM SYS.TABLE_COLUMNS
          WHERE SCHEMA_NAME = CURRENT_SCHEMA
            AND TABLE_NAME = ?
          ORDER BY POSITION
        `,
        [tableName.toUpperCase()],
        connectionKey
      )) as QueryRow[];
      const columnLines = columns.map((column) => {
        const type = this.formatHanaColumnType(column);
        const nullable = column['is_nullable'] === 'FALSE' ? ' NOT NULL' : '';
        const defaultValue = column['default_value'] ? ` DEFAULT ${String(column['default_value'])}` : '';
        return `  ${quoteIdentifier(String(column['column_name']))} ${type}${defaultValue}${nullable}`;
      });
      const ddl = `CREATE COLUMN TABLE ${quoteIdentifier(tableName)} (\n${columnLines.join(',\n')}\n);`;

      return { success: true, ddl };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while loading table DDL.',
        error: getErrorMessage(error)
      };
    }
  }

  private formatHanaColumnType(column: QueryRow): string {
    const dataType = String(column['data_type'] || '');
    if (column['length'] && ['NVARCHAR', 'VARCHAR', 'CHAR', 'NCHAR', 'VARBINARY', 'BINARY'].includes(dataType)) {
      return `${dataType}(${column['length']})`;
    }

    if (column['length'] && ['DECIMAL', 'SMALLDECIMAL'].includes(dataType)) {
      return `${dataType}(${column['length']}, ${column['scale'] || 0})`;
    }

    return dataType;
  }

  private async listIndexes(connectionKey?: string): Promise<IndexRow[]> {
    try {
      return (await this.db.executeQuery(`
        SELECT
          INDEX_NAME AS "index_name",
          TABLE_NAME AS "table_name",
          INDEX_TYPE AS "index_type"
        FROM SYS.INDEXES
        WHERE SCHEMA_NAME = CURRENT_SCHEMA
          AND INDEX_NAME IS NOT NULL
        ORDER BY TABLE_NAME, INDEX_NAME
      `, [], connectionKey)) as IndexRow[];
    } catch (error: unknown) {
      console.warn('Could not list HANA indexes:', getErrorMessage(error));
      return [];
    }
  }
}

export default new ListObjectsHanaV1();
