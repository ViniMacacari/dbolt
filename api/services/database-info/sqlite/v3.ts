import SQLiteV3 from '../../../models/sqlite/v3.js';
import { groupDatabaseObjects, toIndexDatabaseObject, toNamedDatabaseObject } from '../../../utils/database-objects.js';
import { getErrorMessage } from '../../../utils/errors.js';
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

type NamedObjectRow = QueryRow & { name: string; type: 'table' | 'view' | 'trigger'; table_name?: string };
type IndexRow = QueryRow & { index_name: string; table_name: string; index_type: string };
type ColumnRow = QueryRow & TableColumn;
type TableLikeObjectRow = QueryRow & { schema_name: string; name: string; type: 'table' | 'view' };

class ListObjectsSQLiteV3 {
  private readonly db = new SQLiteV3();

  async listDatabaseObjects(connectionKey?: string): Promise<DatabaseObjectsResult> {
    if (this.db.getStatus(connectionKey) !== 'connected') {
      return {
        success: false,
        message: 'No active connection. Ensure the database is connected before querying.'
      };
    }

    try {
      const objects = (await this.db.executeQuery(`
        SELECT name, type
        FROM sqlite_master
        WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `, [], connectionKey)) as NamedObjectRow[];

      const indexes = (await this.db.executeQuery(`
        SELECT
          name AS index_name,
          tbl_name AS table_name,
          'BTREE' AS index_type,
          'index' AS type
        FROM sqlite_master
        WHERE type = 'index'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY tbl_name, name
      `, [], connectionKey)) as IndexRow[];

      const triggers = (await this.db.executeQuery(`
        SELECT name, tbl_name AS table_name, 'trigger' AS type
        FROM sqlite_master
        WHERE type = 'trigger'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY tbl_name, name
      `, [], connectionKey)) as NamedObjectRow[];

      const data: DatabaseObject[] = [
        ...objects.map((object, index) =>
          toNamedDatabaseObject(object, object.type === 'view' ? 'view' : 'table', index)
        ),
        ...triggers.map((object, index) =>
          toNamedDatabaseObject(object, 'trigger', index, String(object.table_name || ''))
        ),
        ...indexes.map((object, index) => toIndexDatabaseObject(object, index))
      ];

      return { success: true, data, ...groupDatabaseObjects(data) };
    } catch (error: unknown) {
      console.error('Error listing SQLite database objects:', error);
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
      const metadataSchema = schemaName || 'main';
      const objects = (await this.db.executeQuery(`
        SELECT name, type
        FROM ${quoteIdentifier(metadataSchema)}.sqlite_master
        WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `, [], connectionKey)) as NamedObjectRow[];

      const data: DatabaseObject[] = objects.map((object, index) =>
        toNamedDatabaseObject(object, object.type === 'view' ? 'view' : 'table', index)
      );

      return { success: true, data, ...groupDatabaseObjects(data) };
    } catch (error: unknown) {
      console.error('Error listing SQLite table objects:', error);
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

      const columns = await this.loadObjectColumns(object.name, connectionKey, object.schema_name);

      return {
        success: true,
        data: columns.map((column) => this.toColumnMetadata(column, object.type))
      };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while listing table columns.',
        error: getErrorMessage(error)
      };
    }
  }

  async tableKeys(tableName: string, connectionKey?: string): Promise<TableMetadataRowsResult> {
    try {
      const columns = (await this.db.executeQuery(
        `PRAGMA table_info(${quoteIdentifier(tableName)})`,
        [],
        connectionKey
      )) as QueryRow[];

      const keys = columns
        .filter((column) => Number(column['pk']) > 0)
        .map((column) => ({
          name: 'PRIMARY',
          type: 'PRIMARY KEY',
          column_name: column['name'],
          ordinal_position: column['pk']
        }));

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
      const indexList = (await this.db.executeQuery(
        `PRAGMA index_list(${quoteIdentifier(tableName)})`,
        [],
        connectionKey
      )) as QueryRow[];
      const indexes: QueryRow[] = [];

      for (const indexRow of indexList) {
        const indexName = String(indexRow['name'] || '');
        if (!indexName) continue;

        const indexColumns = (await this.db.executeQuery(
          `PRAGMA index_info(${quoteIdentifier(indexName)})`,
          [],
          connectionKey
        )) as QueryRow[];

        indexColumns.forEach((column) => {
          indexes.push({
            name: indexName,
            column_name: column['name'],
            unique: indexRow['unique'],
            origin: indexRow['origin'],
            ordinal_position: column['seqno']
          });
        });
      }

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
      const rows = (await this.db.executeQuery(
        `
          SELECT sql
          FROM sqlite_master
          WHERE type IN ('table', 'view')
            AND name = ?
          LIMIT 1
        `,
        [tableName],
        connectionKey
      )) as QueryRow[];

      return { success: true, ddl: String(rows[0]?.['sql'] || '') };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while loading table DDL.',
        error: getErrorMessage(error)
      };
    }
  }

  async procedureDDL(_procedureName: string, _connectionKey?: string): Promise<TableDDLResult> {
    return {
      success: false,
      message: 'SQLite does not support stored procedures.'
    };
  }

  async objectDDL(
    object: { name: string; type: string; table?: string },
    connectionKey?: string
  ): Promise<TableDDLResult> {
    if (object.type !== 'trigger') {
      return { success: false, message: `SQLite does not support exporting ${object.type} through this provider.` };
    }

    try {
      const rows = (await this.db.executeQuery(
        `SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ? LIMIT 1`,
        [object.name],
        connectionKey
      )) as QueryRow[];
      return { success: true, ddl: String(rows[0]?.['sql'] || '') };
    } catch (error: unknown) {
      return {
        success: false,
        message: 'Error occurred while loading trigger DDL.',
        error: getErrorMessage(error)
      };
    }
  }

  private async resolveTableLikeObject(
    tableName: string,
    connectionKey?: string,
    schemaName?: string
  ): Promise<TableLikeObjectRow | null> {
    const metadataSchema = schemaName || 'main';
    const rows = (await this.db.executeQuery(
      `
        SELECT ? AS schema_name, name, type
        FROM ${quoteIdentifier(metadataSchema)}.sqlite_master
        WHERE type IN ('table', 'view')
          AND name = ?
        LIMIT 1
      `,
      [metadataSchema, tableName],
      connectionKey
    )) as TableLikeObjectRow[];

    return rows[0] || null;
  }

  private async loadObjectColumns(
    tableName: string,
    connectionKey?: string,
    schemaName = 'main'
  ): Promise<QueryRow[]> {
    const quotedSchema = quoteIdentifier(schemaName);
    try {
      const columns = (await this.db.executeQuery(
        `PRAGMA ${quotedSchema}.table_xinfo(${quoteIdentifier(tableName)})`,
        [],
        connectionKey
      )) as QueryRow[];

      if (columns.length > 0) {
        return columns;
      }
    } catch (error: unknown) {
      console.warn('Could not load SQLite extended table columns:', getErrorMessage(error));
    }

    return (await this.db.executeQuery(
      `PRAGMA ${quotedSchema}.table_info(${quoteIdentifier(tableName)})`,
      [],
      connectionKey
    )) as QueryRow[];
  }

  private toColumnMetadata(column: QueryRow, objectType: TableLikeObjectRow['type']): TableColumn {
    const type = String(column['type'] || 'TEXT');

    return {
      name: String(column['name'] || ''),
      type,
      data_type: type,
      is_nullable: Number(column['notnull'] || 0) === 1 ? 'NO' : 'YES',
      default_value: column['dflt_value'],
      primary_key: column['pk'],
      ordinal_position: column['cid'],
      hidden: column['hidden'],
      object_type: objectType
    };
  }
}

export default new ListObjectsSQLiteV3();
