import HanaV1 from '../../../models/hana/hana-v1.js';
import { getErrorMessage } from '../../../utils/errors.js';
import { groupDatabaseObjects, toIndexDatabaseObject, toNamedDatabaseObject } from '../../../utils/database-objects.js';

import type {
  DatabaseObject,
  DatabaseObjectsResult,
  QueryRow,
  TableColumn,
  TableColumnsResult
} from '../../../types.js';

type NamedObjectRow = QueryRow & { name: string };
type IndexRow = QueryRow & { index_name: string; table_name: string; index_type?: string };
type ColumnRow = QueryRow & TableColumn;

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
