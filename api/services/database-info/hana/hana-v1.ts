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

type NamedObjectRow = QueryRow & {
  name: string;
  type: 'table' | 'view' | 'procedure' | 'function' | 'trigger' | 'sequence' | 'synonym';
  table_name?: string;
};
type IndexRow = QueryRow & { index_name: string; table_name: string; index_type?: string };
type ColumnRow = QueryRow & TableColumn;
type TableLikeObjectRow = QueryRow & {
  schema_name: string;
  name: string;
  type: 'table' | 'view';
};

class ListObjectsHanaV1 {
  private readonly db = new HanaV1();

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

      const functions = (await this.db.executeQuery(`
        SELECT FUNCTION_NAME AS "name", 'function' AS "type"
        FROM SYS.FUNCTIONS
        WHERE SCHEMA_NAME = CURRENT_SCHEMA
        ORDER BY FUNCTION_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const triggers = (await this.db.executeQuery(`
        SELECT TRIGGER_NAME AS "name", SUBJECT_TABLE_NAME AS "table_name", 'trigger' AS "type"
        FROM SYS.TRIGGERS
        WHERE SCHEMA_NAME = CURRENT_SCHEMA
        ORDER BY SUBJECT_TABLE_NAME, TRIGGER_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const sequences = (await this.db.executeQuery(`
        SELECT SEQUENCE_NAME AS "name", 'sequence' AS "type"
        FROM SYS.SEQUENCES
        WHERE SCHEMA_NAME = CURRENT_SCHEMA
        ORDER BY SEQUENCE_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const synonyms = (await this.db.executeQuery(`
        SELECT SYNONYM_NAME AS "name", 'synonym' AS "type"
        FROM SYS.SYNONYMS
        WHERE SCHEMA_NAME = CURRENT_SCHEMA
        ORDER BY SYNONYM_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const indexes = await this.listIndexes(connectionKey);

      const data: DatabaseObject[] = [
        ...tables.map((object, index) => toNamedDatabaseObject(object, 'table', index)),
        ...views.map((object, index) => toNamedDatabaseObject(object, 'view', index)),
        ...procedures.map((object, index) => toNamedDatabaseObject(object, 'procedure', index)),
        ...functions.map((object, index) => toNamedDatabaseObject(object, 'function', index)),
        ...triggers.map((object, index) => toNamedDatabaseObject(object, 'trigger', index, String(object.table_name || ''))),
        ...sequences.map((object, index) => toNamedDatabaseObject(object, 'sequence', index)),
        ...synonyms.map((object, index) => toNamedDatabaseObject(object, 'synonym', index)),
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

  async listTableObjects(connectionKey?: string, schemaName?: string): Promise<DatabaseObjectsResult> {
    try {
      const objects = (await this.db.executeQuery(`
        SELECT "name", "type"
        FROM (
          SELECT TABLE_NAME AS "name", 'table' AS "type"
          FROM PUBLIC.TABLES
          WHERE SCHEMA_NAME = COALESCE(?, CURRENT_SCHEMA)
          UNION ALL
          SELECT VIEW_NAME AS "name", 'view' AS "type"
          FROM PUBLIC.VIEWS
          WHERE SCHEMA_NAME = COALESCE(?, CURRENT_SCHEMA)
        ) objects
        ORDER BY "name"
      `, [schemaName || null, schemaName || null], connectionKey)) as NamedObjectRow[];

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
        data: columns.map((column) => this.toColumnMetadata(column, object.type))
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
      const object = await this.resolveTableLikeObject(tableName, connectionKey);
      if (!object || object.type === 'view') {
        return { success: true, data: [] };
      }

      const keys = (await this.db.executeQuery(
        `
          SELECT
            c.CONSTRAINT_NAME AS "name",
            CASE
              WHEN c.IS_PRIMARY_KEY = 'TRUE' THEN 'PRIMARY KEY'
              WHEN c.IS_UNIQUE_KEY = 'TRUE' THEN 'UNIQUE'
              ELSE 'CONSTRAINT'
            END AS "type",
            c.COLUMN_NAME AS "column_name",
            c.POSITION AS "ordinal_position"
          FROM SYS.CONSTRAINTS c
          WHERE c.SCHEMA_NAME = CURRENT_SCHEMA
            AND c.TABLE_NAME = ?
          ORDER BY c.CONSTRAINT_NAME, c.POSITION
        `,
        [object.name],
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
      const object = await this.resolveTableLikeObject(tableName, connectionKey);
      if (!object || object.type === 'view') {
        return { success: true, data: [] };
      }

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
        [object.name],
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

      if (object.type === 'view') {
        const viewRows = (await this.db.executeQuery(
          `
            SELECT DEFINITION AS "definition"
            FROM SYS.VIEWS
            WHERE SCHEMA_NAME = CURRENT_SCHEMA
              AND VIEW_NAME = ?
          `,
          [object.name],
          connectionKey
        )) as QueryRow[];

        return {
          success: true,
          ddl: this.formatHanaViewDDL(object.name, String(viewRows[0]?.['definition'] || ''))
        };
      }

      const columns = (await this.loadObjectColumns(object, connectionKey)) as QueryRow[];
      const columnLines = columns.map((column) => {
        const type = this.formatHanaColumnType(column);
        const nullable = column['is_nullable'] === 'FALSE' ? ' NOT NULL' : '';
        const defaultValue = column['default_value'] ? ` DEFAULT ${String(column['default_value'])}` : '';
        return `  ${quoteIdentifier(String(column['name']))} ${type}${defaultValue}${nullable}`;
      });
      const ddl = `CREATE COLUMN TABLE ${quoteIdentifier(object.name)} (\n${columnLines.join(',\n')}\n);`;

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
      const rows = (await this.db.executeQuery(
        `
          SELECT DEFINITION AS "ddl"
          FROM SYS.PROCEDURES
          WHERE SCHEMA_NAME = CURRENT_SCHEMA
            AND PROCEDURE_NAME = ?
        `,
        [procedureName],
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

  async objectDDL(
    object: { name: string; type: string; table?: string },
    connectionKey?: string
  ): Promise<TableDDLResult> {
    if (object.type === 'procedure') return this.procedureDDL(object.name, connectionKey);

    try {
      if (object.type === 'function' || object.type === 'trigger') {
        const catalog = object.type === 'function' ? 'FUNCTIONS' : 'TRIGGERS';
        const nameColumn = object.type === 'function' ? 'FUNCTION_NAME' : 'TRIGGER_NAME';
        const rows = (await this.db.executeQuery(
          `SELECT DEFINITION AS "ddl" FROM SYS.${catalog} ` +
          `WHERE SCHEMA_NAME = CURRENT_SCHEMA AND ${nameColumn} = ?`,
          [object.name],
          connectionKey
        )) as QueryRow[];
        return { success: true, ddl: String(rows[0]?.['ddl'] || '') };
      }

      if (object.type === 'sequence') {
        const rows = (await this.db.executeQuery(
          `
            SELECT START_NUMBER AS "start_number", MIN_VALUE AS "min_value",
                   MAX_VALUE AS "max_value", INCREMENT_BY AS "increment_by",
                   IS_CYCLED AS "is_cycled", CACHE_SIZE AS "cache_size",
                   RESET_BY_QUERY AS "reset_by_query"
            FROM SYS.SEQUENCES
            WHERE SCHEMA_NAME = CURRENT_SCHEMA
              AND SEQUENCE_NAME = ?
          `,
          [object.name],
          connectionKey
        )) as QueryRow[];
        const row = rows[0];
        if (!row) return { success: true, ddl: '' };
        const ddl = [
          `CREATE SEQUENCE ${quoteIdentifier(object.name)}`,
          `START WITH ${row['start_number']}`,
          `INCREMENT BY ${row['increment_by']}`,
          `MINVALUE ${row['min_value']}`,
          `MAXVALUE ${row['max_value']}`,
          String(row['is_cycled']).toUpperCase() === 'TRUE' ? 'CYCLE' : 'NO CYCLE',
          Number(row['cache_size'] || 0) > 0 ? `CACHE ${row['cache_size']}` : 'NO CACHE',
          row['reset_by_query'] ? `RESET BY ${row['reset_by_query']}` : ''
        ].filter(Boolean).join('\n  ');
        return { success: true, ddl };
      }

      if (object.type === 'synonym') {
        const rows = (await this.db.executeQuery(
          `
            SELECT OBJECT_DATABASE AS "object_database", OBJECT_SCHEMA AS "object_schema",
                   OBJECT_NAME AS "object_name"
            FROM SYS.SYNONYMS
            WHERE SCHEMA_NAME = CURRENT_SCHEMA
              AND SYNONYM_NAME = ?
          `,
          [object.name],
          connectionKey
        )) as QueryRow[];
        const row = rows[0];
        if (!row) return { success: true, ddl: '' };
        const target = [row['object_database'], row['object_schema'], row['object_name']]
          .filter(Boolean)
          .map((part) => quoteIdentifier(String(part)))
          .join('.');
        return { success: true, ddl: `CREATE SYNONYM ${quoteIdentifier(object.name)} FOR ${target}` };
      }

      return { success: false, message: `HANA does not support exporting ${object.type} through this provider.` };
    } catch (error: unknown) {
      return {
        success: false,
        message: `Error occurred while loading ${object.type} DDL.`,
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

  private async resolveTableLikeObject(
    tableName: string,
    connectionKey?: string,
    schemaName?: string
  ): Promise<TableLikeObjectRow | null> {
    const lookupNames = this.buildLookupNames(tableName);
    if (!lookupNames[0]) {
      return null;
    }

    const rows = (await this.db.executeQuery(
      `
        SELECT "schema_name", "name", "type"
        FROM (
          SELECT SCHEMA_NAME AS "schema_name", TABLE_NAME AS "name", 'table' AS "type"
          FROM SYS.TABLES
          WHERE SCHEMA_NAME = COALESCE(?, CURRENT_SCHEMA)
            AND TABLE_NAME IN (?, ?)
          UNION ALL
          SELECT SCHEMA_NAME AS "schema_name", VIEW_NAME AS "name", 'view' AS "type"
          FROM SYS.VIEWS
          WHERE SCHEMA_NAME = COALESCE(?, CURRENT_SCHEMA)
            AND VIEW_NAME IN (?, ?)
        ) objects
        ORDER BY
          CASE WHEN "name" = ? THEN 0 ELSE 1 END,
          CASE WHEN "type" = 'table' THEN 0 ELSE 1 END
        LIMIT 1
      `,
      [
        schemaName || null,
        lookupNames[0],
        lookupNames[1],
        schemaName || null,
        lookupNames[0],
        lookupNames[1],
        lookupNames[0]
      ],
      connectionKey
    )) as TableLikeObjectRow[];

    return rows[0] || null;
  }

  private async loadObjectColumns(object: TableLikeObjectRow, connectionKey?: string): Promise<ColumnRow[]> {
    if (object.type === 'view') {
      return (await this.db.executeQuery(
        `
          SELECT
            VIEW_NAME AS "object_name",
            COLUMN_NAME AS "name",
            DATA_TYPE_NAME AS "data_type",
            LENGTH AS "length",
            SCALE AS "scale",
            IS_NULLABLE AS "is_nullable",
            DEFAULT_VALUE AS "default_value",
            COMMENTS AS "comment",
            INDEX_TYPE AS "index_type",
            POSITION AS "ordinal_position"
          FROM SYS.VIEW_COLUMNS
          WHERE SCHEMA_NAME = ?
            AND VIEW_NAME = ?
          ORDER BY POSITION
        `,
        [object.schema_name, object.name],
        connectionKey
      )) as ColumnRow[];
    }

    return (await this.db.executeQuery(
      `
        SELECT
          TABLE_NAME AS "object_name",
          COLUMN_NAME AS "name",
          DATA_TYPE_NAME AS "data_type",
          LENGTH AS "length",
          SCALE AS "scale",
          IS_NULLABLE AS "is_nullable",
          DEFAULT_VALUE AS "default_value",
          COMMENTS AS "comment",
          INDEX_TYPE AS "index_type",
          POSITION AS "ordinal_position"
        FROM SYS.TABLE_COLUMNS
        WHERE SCHEMA_NAME = ?
          AND TABLE_NAME = ?
        ORDER BY POSITION
      `,
      [object.schema_name, object.name],
      connectionKey
    )) as ColumnRow[];
  }

  private toColumnMetadata(column: QueryRow, objectType: 'table' | 'view'): TableColumn {
    const fullType = this.formatHanaColumnType(column);

    return {
      name: String(column['name'] || ''),
      type: fullType,
      data_type: column['data_type'],
      length: column['length'],
      scale: column['scale'],
      is_nullable: column['is_nullable'],
      default_value: column['default_value'],
      comment: column['comment'],
      index_type: column['index_type'],
      ordinal_position: column['ordinal_position'],
      object_type: objectType
    };
  }

  private formatHanaViewDDL(viewName: string, definition: string): string {
    const trimmed = definition.trim();
    if (!trimmed) {
      return '';
    }

    if (/^create\s+(or\s+replace\s+)?(column\s+)?view\b/i.test(trimmed)) {
      return trimmed.endsWith(';') ? trimmed : `${trimmed};`;
    }

    return `CREATE VIEW ${quoteIdentifier(viewName)} AS\n${trimmed}${trimmed.endsWith(';') ? '' : ';'}`;
  }

  private buildLookupNames(tableName: string): [string, string] {
    const exactName = String(tableName || '').trim();
    const upperName = exactName.toUpperCase();

    return [exactName, upperName || exactName];
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
