import HanaV1 from '../../../models/hana/hana-v1.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  DatabaseObject,
  DatabaseObjectsResult,
  QueryRow,
  TableColumn,
  TableColumnsResult
} from '../../../types.js';

type NamedObjectRow = QueryRow & { name: string };
type ColumnRow = QueryRow & TableColumn;

class ListObjectsHanaV1 {
  private readonly db = new HanaV1();

  async listDatabaseObjects(): Promise<DatabaseObjectsResult> {
    try {
      const tables = (await this.db.executeQuery(`
        SELECT TABLE_NAME AS name, 'table' AS type
        FROM PUBLIC.TABLES
        WHERE SCHEMA_NAME = CURRENT_SCHEMA
        ORDER BY TABLE_NAME
      `)) as NamedObjectRow[];

      const views = (await this.db.executeQuery(`
        SELECT VIEW_NAME AS name, 'view' AS type
        FROM PUBLIC.VIEWS
        WHERE SCHEMA_NAME = CURRENT_SCHEMA
        ORDER BY VIEW_NAME
      `)) as NamedObjectRow[];

      const procedures = (await this.db.executeQuery(`
        SELECT PROCEDURE_NAME AS name, 'procedure' AS type
        FROM PUBLIC.PROCEDURES
        WHERE SCHEMA_NAME = CURRENT_SCHEMA
        ORDER BY PROCEDURE_NAME
      `)) as NamedObjectRow[];

      const data: DatabaseObject[] = [
        ...tables.map((object) => ({ name: object.name, type: 'table' as const })),
        ...views.map((object) => ({ name: object.name, type: 'view' as const })),
        ...procedures.map((object) => ({
          name: object.name,
          type: 'procedure' as const
        }))
      ];

      return { success: true, data };
    } catch (error: unknown) {
      console.error('Error listing database objects in HANA:', error);
      return {
        success: false,
        message: 'Error occurred while listing database objects.',
        error: getErrorMessage(error)
      };
    }
  }

  async tableColumns(tableName: string): Promise<TableColumnsResult> {
    try {
      const columns = (await this.db.executeQuery(`
        SELECT COLUMN_NAME AS name, DATA_TYPE_NAME AS type
        FROM SYS.TABLE_COLUMNS
        WHERE TABLE_NAME = '${tableName.toUpperCase()}'
        ORDER BY COLUMN_NAME
      `)) as ColumnRow[];

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
}

export default new ListObjectsHanaV1();
