import PgV1 from '../../../models/postgres/v9.js';
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

type CurrentSchemaRow = QueryRow & { schema: string };
type NamedObjectRow = QueryRow & { name: string; type: 'table' | 'view' | 'function' | 'procedure' };
type IndexRow = QueryRow & { index_name: string; table_name: string; index_type: string };
type ColumnRow = QueryRow & TableColumn;

class ListObjectsPgV1 {
  private readonly db = new PgV1();

  async listDatabaseObjects(connectionKey?: string): Promise<DatabaseObjectsResult> {
    try {
      const currentSchemaResult = (await this.db.executeQuery(
        'SELECT current_schema() AS schema',
        [],
        connectionKey
      )) as CurrentSchemaRow[];
      const currentSchema = currentSchemaResult[0]?.schema;

      if (!currentSchema) {
        throw new Error('No schema selected');
      }

      const tables = (await this.db.executeQuery(
        `
          SELECT
              table_name AS name,
              'table' AS type
          FROM information_schema.tables
          WHERE table_type = 'BASE TABLE' AND table_schema = $1
          ORDER BY table_name
        `,
        [currentSchema],
        connectionKey
      )) as NamedObjectRow[];

      const views = (await this.db.executeQuery(
        `
          SELECT
              table_name AS name,
              'view' AS type
          FROM information_schema.views
          WHERE table_schema = $1
          ORDER BY table_name
        `,
        [currentSchema],
        connectionKey
      )) as NamedObjectRow[];

      const routines = (await this.db.executeQuery(
        `
          SELECT
              routine_name AS name,
              CASE
                  WHEN routine_type = 'FUNCTION' THEN 'function'
                  ELSE 'procedure'
              END AS type
          FROM information_schema.routines
          WHERE specific_schema = $1
          ORDER BY routine_name
        `,
        [currentSchema],
        connectionKey
      )) as NamedObjectRow[];

      const indexes = (await this.db.executeQuery(
        `
          SELECT
              i.relname AS index_name,
              t.relname AS table_name,
              a.amname AS index_type,
              'index' AS type
          FROM pg_class t
          INNER JOIN pg_index ix ON t.oid = ix.indrelid
          INNER JOIN pg_class i ON i.oid = ix.indexrelid
          INNER JOIN pg_am a ON i.relam = a.oid
          INNER JOIN pg_namespace n ON t.relnamespace = n.oid
          WHERE t.relkind = 'r' AND n.nspname = $1
          ORDER BY t.relname, i.relname
        `,
        [currentSchema],
        connectionKey
      )) as IndexRow[];

      const data: DatabaseObject[] = [
        ...tables.map((object, index) => toNamedDatabaseObject(object, 'table', index)),
        ...views.map((object, index) => toNamedDatabaseObject(object, 'view', index)),
        ...routines.map((object, index) => toNamedDatabaseObject(object, object.type, index)),
        ...indexes.map((object, index) => toIndexDatabaseObject(object, index))
      ];

      return {
        success: true,
        data,
        ...groupDatabaseObjects(data)
      };
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
      const currentSchemaResult = (await this.db.executeQuery(
        'SELECT current_schema() AS schema',
        [],
        connectionKey
      )) as CurrentSchemaRow[];
      const currentSchema = currentSchemaResult[0]?.schema;

      if (!currentSchema) {
        throw new Error('No schema selected');
      }

      const objects = (await this.db.executeQuery(
        `
          SELECT name, type
          FROM (
            SELECT
                table_name AS name,
                'table' AS type
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE' AND table_schema = $1
            UNION ALL
            SELECT
                table_name AS name,
                'view' AS type
            FROM information_schema.views
            WHERE table_schema = $1
          ) objects
          ORDER BY name
        `,
        [currentSchema],
        connectionKey
      )) as NamedObjectRow[];

      const data: DatabaseObject[] = objects.map((object, index) =>
        toNamedDatabaseObject(object, object.type === 'view' ? 'view' : 'table', index)
      );

      return {
        success: true,
        data,
        ...groupDatabaseObjects(data)
      };
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
      const columns = (await this.db.executeQuery(
        `
          SELECT column_name AS name, data_type AS type
          FROM information_schema.columns
          WHERE table_name = $1
            AND table_schema = current_schema()
          ORDER BY ordinal_position
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
            tc.constraint_name AS name,
            tc.constraint_type AS type,
            kcu.column_name,
            kcu.ordinal_position,
            ccu.table_name AS referenced_table,
            ccu.column_name AS referenced_column
          FROM information_schema.table_constraints tc
          LEFT JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_schema = tc.constraint_schema
            AND kcu.constraint_name = tc.constraint_name
            AND kcu.table_schema = tc.table_schema
            AND kcu.table_name = tc.table_name
          LEFT JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_schema = tc.constraint_schema
            AND ccu.constraint_name = tc.constraint_name
          WHERE tc.table_schema = current_schema()
            AND tc.table_name = $1
          ORDER BY tc.constraint_type, tc.constraint_name, kcu.ordinal_position
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
            indexname AS name,
            indexdef AS ddl
          FROM pg_indexes
          WHERE schemaname = current_schema()
            AND tablename = $1
          ORDER BY indexname
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
      const columns = (await this.db.executeQuery(
        `
          SELECT
            column_name,
            data_type,
            character_maximum_length,
            numeric_precision,
            numeric_scale,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = $1
          ORDER BY ordinal_position
        `,
        [tableName],
        connectionKey
      )) as QueryRow[];
      const columnLines = columns.map((column) => {
        const type = this.formatPostgresColumnType(column);
        const nullable = column['is_nullable'] === 'NO' ? ' NOT NULL' : '';
        const defaultValue = column['column_default'] ? ` DEFAULT ${String(column['column_default'])}` : '';
        return `  ${quoteIdentifier(String(column['column_name']))} ${type}${defaultValue}${nullable}`;
      });
      const ddl = `CREATE TABLE ${quoteIdentifier(tableName)} (\n${columnLines.join(',\n')}\n);`;

      return { success: true, ddl };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while loading table DDL.',
        error: getErrorMessage(error)
      };
    }
  }

  private formatPostgresColumnType(column: QueryRow): string {
    const dataType = String(column['data_type'] || '');
    if (column['character_maximum_length']) {
      return `${dataType}(${column['character_maximum_length']})`;
    }

    if (column['numeric_precision']) {
      return column['numeric_scale']
        ? `${dataType}(${column['numeric_precision']}, ${column['numeric_scale']})`
        : `${dataType}(${column['numeric_precision']})`;
    }

    return dataType;
  }
}

export default new ListObjectsPgV1();
