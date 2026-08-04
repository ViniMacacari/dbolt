import PgV1 from '../../../models/postgres/v9.js';
import { getErrorMessage } from '../../../utils/errors.js';
import { groupDatabaseObjects, toIndexDatabaseObject, toNamedDatabaseObject } from '../../../utils/database-objects.js';
import { quoteIdentifier, quoteSqlString } from '../../../utils/sql-identifiers.js';

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
type NamedObjectRow = QueryRow & {
  name: string;
  type: 'table' | 'view' | 'materialized_view' | 'function' | 'procedure' | 'trigger' | 'sequence' | 'type' | 'domain';
  table_name?: string;
};
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

      const materializedViews = (await this.db.executeQuery(
        `
          SELECT c.relname AS name, 'materialized_view' AS type
          FROM pg_class c
          INNER JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1
            AND c.relkind = 'm'
          ORDER BY c.relname
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

      const triggers = (await this.db.executeQuery(
        `
          SELECT t.tgname AS name, c.relname AS table_name, 'trigger' AS type
          FROM pg_trigger t
          INNER JOIN pg_class c ON c.oid = t.tgrelid
          INNER JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1
            AND NOT t.tgisinternal
          ORDER BY c.relname, t.tgname
        `,
        [currentSchema],
        connectionKey
      )) as NamedObjectRow[];

      const sequences = (await this.db.executeQuery(
        `
          SELECT sequence_name AS name, 'sequence' AS type
          FROM information_schema.sequences
          WHERE sequence_schema = $1
          ORDER BY sequence_name
        `,
        [currentSchema],
        connectionKey
      )) as NamedObjectRow[];

      const customTypes = (await this.db.executeQuery(
        `
          SELECT t.typname AS name,
                 CASE WHEN t.typtype = 'd' THEN 'domain' ELSE 'type' END AS type
          FROM pg_type t
          INNER JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = $1
            AND (t.typtype = 'e' OR t.typtype = 'd')
          ORDER BY type, t.typname
        `,
        [currentSchema],
        connectionKey
      )) as NamedObjectRow[];

      const data: DatabaseObject[] = [
        ...tables.map((object, index) => toNamedDatabaseObject(object, 'table', index)),
        ...views.map((object, index) => toNamedDatabaseObject(object, 'view', index)),
        ...materializedViews.map((object, index) => toNamedDatabaseObject(object, 'materialized_view', index)),
        ...routines.map((object, index) => toNamedDatabaseObject(object, object.type, index)),
        ...triggers.map((object, index) => toNamedDatabaseObject(object, 'trigger', index, String(object.table_name || ''))),
        ...sequences.map((object, index) => toNamedDatabaseObject(object, 'sequence', index)),
        ...customTypes.map((object, index) => toNamedDatabaseObject(object, object.type, index)),
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

  async listTableObjects(connectionKey?: string, schemaName?: string): Promise<DatabaseObjectsResult> {
    try {
      let metadataSchema = schemaName;

      if (!metadataSchema) {
        const currentSchemaResult = (await this.db.executeQuery(
          'SELECT current_schema() AS schema',
          [],
          connectionKey
        )) as CurrentSchemaRow[];
        metadataSchema = currentSchemaResult[0]?.schema;
      }

      if (!metadataSchema) {
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
        [metadataSchema],
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

  async tableColumns(
    tableName: string,
    connectionKey?: string,
    schemaName?: string
  ): Promise<TableColumnsResult> {
    try {
      const object = await this.resolveTableLikeObject(tableName, connectionKey, schemaName);
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

  async objectDDL(
    object: { name: string; type: string; table?: string },
    connectionKey?: string
  ): Promise<TableDDLResult> {
    if (object.type === 'procedure' || object.type === 'function') {
      return this.procedureDDL(object.name, connectionKey);
    }

    try {
      if (object.type === 'trigger') {
        const rows = (await this.db.executeQuery(
          `
            SELECT pg_get_triggerdef(t.oid, true) AS ddl
            FROM pg_trigger t
            INNER JOIN pg_class c ON c.oid = t.tgrelid
            INNER JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = current_schema()
              AND t.tgname = $1
              AND ($2::text IS NULL OR c.relname = $2)
              AND NOT t.tgisinternal
            ORDER BY c.relname
            LIMIT 1
          `,
          [object.name, object.table || null],
          connectionKey
        )) as QueryRow[];
        return { success: true, ddl: String(rows[0]?.['ddl'] || '') };
      }

      if (object.type === 'sequence') {
        const rows = (await this.db.executeQuery(
          `
            SELECT sequence_schema, sequence_name, start_value, minimum_value,
                   maximum_value, increment, cycle_option
            FROM information_schema.sequences
            WHERE sequence_schema = current_schema()
              AND sequence_name = $1
            LIMIT 1
          `,
          [object.name],
          connectionKey
        )) as QueryRow[];
        const row = rows[0];
        if (!row) return { success: true, ddl: '' };
        const qualified = `${quoteIdentifier(String(row['sequence_schema']))}.${quoteIdentifier(object.name)}`;
        const ddl = [
          `CREATE SEQUENCE ${qualified}`,
          `START WITH ${row['start_value']}`,
          `INCREMENT BY ${row['increment']}`,
          `MINVALUE ${row['minimum_value']}`,
          `MAXVALUE ${row['maximum_value']}`,
          String(row['cycle_option']).toUpperCase() === 'YES' ? 'CYCLE' : 'NO CYCLE'
        ].join('\n  ');
        return { success: true, ddl };
      }

      if (object.type === 'type') {
        const rows = (await this.db.executeQuery(
          `
            SELECT n.nspname AS schema_name, e.enumlabel
            FROM pg_type t
            INNER JOIN pg_namespace n ON n.oid = t.typnamespace
            INNER JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE n.nspname = current_schema()
              AND t.typname = $1
            ORDER BY e.oid
          `,
          [object.name],
          connectionKey
        )) as QueryRow[];
        if (rows.length === 0) return { success: true, ddl: '' };
        const qualified = `${quoteIdentifier(String(rows[0]?.['schema_name']))}.${quoteIdentifier(object.name)}`;
        const labels = rows.map((row) => quoteSqlString(String(row['enumlabel']))).join(', ');
        return { success: true, ddl: `CREATE TYPE ${qualified} AS ENUM (${labels})` };
      }

      if (object.type === 'domain') {
        const rows = (await this.db.executeQuery(
          `
            SELECT n.nspname AS schema_name,
                   format_type(t.typbasetype, t.typtypmod) AS base_type,
                   t.typnotnull AS not_null,
                   pg_get_expr(t.typdefaultbin, 0) AS default_value
            FROM pg_type t
            INNER JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = current_schema()
              AND t.typname = $1
              AND t.typtype = 'd'
            LIMIT 1
          `,
          [object.name],
          connectionKey
        )) as QueryRow[];
        const row = rows[0];
        if (!row) return { success: true, ddl: '' };
        const qualified = `${quoteIdentifier(String(row['schema_name']))}.${quoteIdentifier(object.name)}`;
        const defaultValue = row['default_value'] ? ` DEFAULT ${row['default_value']}` : '';
        const notNull = row['not_null'] === true || String(row['not_null']).toLowerCase() === 'true' ? ' NOT NULL' : '';
        const constraints = (await this.db.executeQuery(
          `
            SELECT c.conname, pg_get_constraintdef(c.oid, true) AS definition
            FROM pg_constraint c
            INNER JOIN pg_type t ON t.oid = c.contypid
            INNER JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = current_schema()
              AND t.typname = $1
            ORDER BY c.conname
          `,
          [object.name],
          connectionKey
        )) as QueryRow[];
        const constraintDDL = constraints
          .map((constraint) =>
            ` CONSTRAINT ${quoteIdentifier(String(constraint['conname']))} ${constraint['definition']}`
          )
          .join('');
        return {
          success: true,
          ddl: `CREATE DOMAIN ${qualified} AS ${row['base_type']}${defaultValue}${notNull}${constraintDDL}`
        };
      }

      return { success: false, message: `PostgreSQL does not support exporting ${object.type} through this provider.` };
    } catch (error: unknown) {
      return {
        success: false,
        message: `Error occurred while loading ${object.type} DDL.`,
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

  private async resolveTableLikeObject(
    tableName: string,
    connectionKey?: string,
    schemaName?: string
  ): Promise<TableLikeObjectRow | null> {
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
        WHERE n.nspname = COALESCE($2::text, current_schema())
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
      [tableName, schemaName || null],
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
