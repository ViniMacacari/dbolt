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
type TableLikeObjectRow = QueryRow & {
  object_id: string;
  schema_name: string;
  name: string;
  object_type: 'table' | 'view' | 'materialized_view';
};

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
      const object = await this.resolveTableLikeObject(tableName, connectionKey);
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
      const object = await this.resolveTableLikeObject(tableName, connectionKey);
      if (!object) {
        return { success: true, ddl: '' };
      }

      if (object.object_type === 'view' || object.object_type === 'materialized_view') {
        const rows = (await this.db.executeQuery(
          'SELECT pg_get_viewdef($1::oid, true) AS definition',
          [object.object_id],
          connectionKey
        )) as QueryRow[];

        return {
          success: true,
          ddl: this.formatPostgresViewDDL(object, String(rows[0]?.['definition'] || ''))
        };
      }

      const columns = (await this.loadObjectColumns(object, connectionKey)) as QueryRow[];
      const columnLines = columns.map((column) => {
        const type = this.formatPostgresColumnType(column);
        const nullable = column['is_nullable'] === 'NO' ? ' NOT NULL' : '';
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
      const routines = (await this.db.executeQuery(
        `
          SELECT pg_get_functiondef(p.oid) AS ddl
          FROM pg_proc p
          INNER JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = current_schema()
            AND p.proname = $1
          ORDER BY p.oid
        `,
        [procedureName],
        connectionKey
      )) as QueryRow[];
      const ddl = routines.map((routine) => String(routine['ddl'] || '')).filter(Boolean).join('\n\n');

      return { success: true, ddl };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while loading procedure DDL.',
        error: getErrorMessage(error)
      };
    }
  }

  private formatPostgresColumnType(column: QueryRow): string {
    const dataType = String(column['data_type'] || '');
    if (dataType === 'USER-DEFINED' && column['udt_name']) {
      return String(column['udt_name']);
    }

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

  private async resolveTableLikeObject(tableName: string, connectionKey?: string): Promise<TableLikeObjectRow | null> {
    const rows = (await this.db.executeQuery(
      `
        SELECT
          c.oid::text AS object_id,
          n.nspname AS schema_name,
          c.relname AS name,
          CASE
            WHEN c.relkind = 'v' THEN 'view'
            WHEN c.relkind = 'm' THEN 'materialized_view'
            ELSE 'table'
          END AS object_type
        FROM pg_class c
        INNER JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relname = $1
          AND c.relkind IN ('r', 'p', 'v', 'm')
        ORDER BY
          CASE c.relkind
            WHEN 'r' THEN 0
            WHEN 'p' THEN 0
            WHEN 'v' THEN 1
            ELSE 2
          END
        LIMIT 1
      `,
      [tableName],
      connectionKey
    )) as TableLikeObjectRow[];

    return rows[0] || null;
  }

  private async loadObjectColumns(object: TableLikeObjectRow, connectionKey?: string): Promise<ColumnRow[]> {
    return (await this.db.executeQuery(
      `
        SELECT
          table_name AS object_name,
          column_name AS name,
          data_type,
          udt_name,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          datetime_precision,
          is_nullable,
          column_default,
          collation_name,
          ordinal_position
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
        ORDER BY ordinal_position
      `,
      [object.schema_name, object.name],
      connectionKey
    )) as ColumnRow[];
  }

  private toColumnMetadata(column: QueryRow, objectType: TableLikeObjectRow['object_type']): TableColumn {
    return {
      name: String(column['name'] || ''),
      type: this.formatPostgresColumnType(column),
      data_type: column['data_type'],
      udt_name: column['udt_name'],
      character_maximum_length: column['character_maximum_length'],
      numeric_precision: column['numeric_precision'],
      numeric_scale: column['numeric_scale'],
      datetime_precision: column['datetime_precision'],
      is_nullable: column['is_nullable'],
      column_default: column['column_default'],
      collation_name: column['collation_name'],
      ordinal_position: column['ordinal_position'],
      object_type: objectType
    };
  }

  private formatPostgresViewDDL(object: TableLikeObjectRow, definition: string): string {
    const trimmed = definition.trim();
    if (!trimmed) {
      return '';
    }

    const keyword = object.object_type === 'materialized_view' ? 'MATERIALIZED VIEW' : 'VIEW';
    return `CREATE ${keyword} ${quoteIdentifier(object.schema_name)}.${quoteIdentifier(object.name)} AS\n${trimmed}${trimmed.endsWith(';') ? '' : ';'}`;
  }
}

export default new ListObjectsPgV1();
