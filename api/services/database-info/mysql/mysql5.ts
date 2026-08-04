import MySQLV1 from '../../../models/mysql/mysql5.js';
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
  type: 'table' | 'view' | 'procedure' | 'function' | 'trigger' | 'event';
  table_name?: string;
};
type IndexRow = QueryRow & { index_name: string; table_name: string; index_type: string };
type ColumnRow = QueryRow & TableColumn;
type TableLikeObjectRow = QueryRow & {
  schema_name: string;
  name: string;
  object_type: 'table' | 'view';
};

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

      const routines = (await this.db.executeQuery(`
        SELECT ROUTINE_NAME AS name,
               CASE WHEN ROUTINE_TYPE = 'FUNCTION' THEN 'function' ELSE 'procedure' END AS type
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_SCHEMA = DATABASE()
        ORDER BY ROUTINE_TYPE, ROUTINE_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const triggers = (await this.db.executeQuery(`
        SELECT TRIGGER_NAME AS name, EVENT_OBJECT_TABLE AS table_name, 'trigger' AS type
        FROM INFORMATION_SCHEMA.TRIGGERS
        WHERE TRIGGER_SCHEMA = DATABASE()
        ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME
      `, [], connectionKey)) as NamedObjectRow[];

      const events = (await this.db.executeQuery(`
        SELECT EVENT_NAME AS name, 'event' AS type
        FROM INFORMATION_SCHEMA.EVENTS
        WHERE EVENT_SCHEMA = DATABASE()
        ORDER BY EVENT_NAME
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
        ...tables.map((object, index) => toNamedDatabaseObject(object, 'table', index)),
        ...views.map((object, index) => toNamedDatabaseObject(object, 'view', index)),
        ...routines.map((object, index) => toNamedDatabaseObject(object, object.type, index)),
        ...triggers.map((object, index) => toNamedDatabaseObject(object, 'trigger', index, String(object.table_name || ''))),
        ...events.map((object, index) => toNamedDatabaseObject(object, 'event', index)),
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

  async listTableObjects(connectionKey?: string, schemaName?: string): Promise<DatabaseObjectsResult> {
    if (this.db.getStatus(connectionKey) !== 'connected') {
      return {
        success: false,
        message: 'No active connection. Ensure the database is connected before querying.'
      };
    }

    try {
      const objects = (await this.db.executeQuery(`
        SELECT name, type
        FROM (
          SELECT TABLE_NAME AS name, 'table' AS type
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = COALESCE(?, DATABASE())
            AND TABLE_TYPE = 'BASE TABLE'
          UNION ALL
          SELECT TABLE_NAME AS name, 'view' AS type
          FROM INFORMATION_SCHEMA.VIEWS
          WHERE TABLE_SCHEMA = COALESCE(?, DATABASE())
        ) objects
        ORDER BY name
      `, [schemaName || null, schemaName || null], connectionKey)) as NamedObjectRow[];

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

  async tableColumns(
    tableName: string,
    connectionKey?: string,
    schemaName?: string
  ): Promise<TableColumnsResult> {
    if (this.db.getStatus(connectionKey) !== 'connected') {
      return {
        success: false,
        message: 'No active connection. Ensure the database is connected before querying.'
      };
    }

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
            tc.CONSTRAINT_NAME AS name,
            tc.CONSTRAINT_TYPE AS type,
            kcu.COLUMN_NAME AS column_name,
            kcu.ORDINAL_POSITION AS ordinal_position,
            kcu.REFERENCED_TABLE_NAME AS referenced_table,
            kcu.REFERENCED_COLUMN_NAME AS referenced_column
          FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
          INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
            ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
            AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
            AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
            AND kcu.TABLE_NAME = tc.TABLE_NAME
          WHERE tc.TABLE_SCHEMA = DATABASE()
            AND tc.TABLE_NAME = ?
          ORDER BY tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
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
            INDEX_NAME AS name,
            COLUMN_NAME AS column_name,
            INDEX_TYPE AS index_type,
            NON_UNIQUE AS non_unique,
            SEQ_IN_INDEX AS ordinal_position
          FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
          ORDER BY INDEX_NAME, SEQ_IN_INDEX
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

      const statement = object.object_type === 'view' ? 'SHOW CREATE VIEW' : 'SHOW CREATE TABLE';
      const rows = (await this.db.executeQuery(
        `${statement} ${quoteIdentifier(object.name, '`')}`,
        [],
        connectionKey
      )) as QueryRow[];
      const ddl = String(rows[0]?.['Create Table'] || rows[0]?.['Create View'] || '');

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
    return this.objectDDL({ name: procedureName, type: 'procedure' }, connectionKey);
  }

  async objectDDL(
    object: { name: string; type: string; table?: string },
    connectionKey?: string
  ): Promise<TableDDLResult> {
    try {
      const objectType = object.type as 'procedure' | 'function' | 'trigger' | 'event';
      if (!['procedure', 'function', 'trigger', 'event'].includes(objectType)) {
        return { success: false, message: `MySQL does not support exporting ${object.type} through this provider.` };
      }
      const command = objectType.toUpperCase();
      const rows = (await this.db.executeQuery(
        `SHOW CREATE ${command} ${quoteIdentifier(object.name, '`')}`,
        [],
        connectionKey
      )) as QueryRow[];
      const ddlKeys: Record<typeof objectType, string[]> = {
        procedure: ['Create Procedure'],
        function: ['Create Function'],
        trigger: ['SQL Original Statement', 'Create Trigger'],
        event: ['Create Event']
      };
      const row = rows[0] || {};
      const ddl = String(ddlKeys[objectType].map((key) => row[key]).find(Boolean) || '');

      return { success: true, ddl };
    } catch (error: unknown) {
      return {
        success: false,
        message: `Error occurred while loading ${object.type} DDL.`,
        error: getErrorMessage(error)
      };
    }
  }

  private async resolveTableLikeObject(
    tableName: string,
    connectionKey?: string,
    schemaName?: string
  ): Promise<TableLikeObjectRow | null> {
    const rows = (await this.db.executeQuery(
      `
        SELECT
          TABLE_SCHEMA AS schema_name,
          TABLE_NAME AS name,
          CASE WHEN TABLE_TYPE = 'VIEW' THEN 'view' ELSE 'table' END AS object_type
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = COALESCE(?, DATABASE())
          AND TABLE_NAME = ?
          AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
        LIMIT 1
      `,
      [schemaName || null, tableName],
      connectionKey
    )) as TableLikeObjectRow[];

    return rows[0] || null;
  }

  private async loadObjectColumns(object: TableLikeObjectRow, connectionKey?: string): Promise<ColumnRow[]> {
    return (await this.db.executeQuery(
      `
        SELECT
          TABLE_NAME AS object_name,
          COLUMN_NAME AS name,
          COLUMN_TYPE AS column_type,
          DATA_TYPE AS data_type,
          CHARACTER_MAXIMUM_LENGTH AS character_maximum_length,
          NUMERIC_PRECISION AS numeric_precision,
          NUMERIC_SCALE AS numeric_scale,
          DATETIME_PRECISION AS datetime_precision,
          IS_NULLABLE AS is_nullable,
          COLUMN_DEFAULT AS column_default,
          COLUMN_KEY AS column_key,
          EXTRA AS extra,
          COLUMN_COMMENT AS comment,
          COLLATION_NAME AS collation_name,
          ORDINAL_POSITION AS ordinal_position
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `,
      [object.schema_name, object.name],
      connectionKey
    )) as ColumnRow[];
  }

  private toColumnMetadata(column: QueryRow, objectType: TableLikeObjectRow['object_type']): TableColumn {
    return {
      name: String(column['name'] || ''),
      type: String(column['column_type'] || column['data_type'] || ''),
      data_type: column['data_type'],
      column_type: column['column_type'],
      character_maximum_length: column['character_maximum_length'],
      numeric_precision: column['numeric_precision'],
      numeric_scale: column['numeric_scale'],
      datetime_precision: column['datetime_precision'],
      is_nullable: column['is_nullable'],
      column_default: column['column_default'],
      column_key: column['column_key'],
      extra: column['extra'],
      comment: column['comment'],
      collation_name: column['collation_name'],
      ordinal_position: column['ordinal_position'],
      object_type: objectType
    };
  }
}

export default new ListObjectsMySQLV1();
