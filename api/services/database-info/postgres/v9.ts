import PgV1 from '../../../models/postgres/v9.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  DatabaseObject,
  DatabaseObjectsResult,
  QueryRow,
  TableColumn,
  TableColumnsResult
} from '../../../types.js';

type CurrentSchemaRow = QueryRow & { schema: string };
type NamedObjectRow = QueryRow & { name: string; type: 'table' | 'view' | 'function' | 'procedure' };
type IndexRow = QueryRow & { index_name: string; table_name: string; index_type: string };
type ColumnRow = QueryRow & TableColumn;

class ListObjectsPgV1 {
  private readonly db = new PgV1();

  async listDatabaseObjects(): Promise<DatabaseObjectsResult> {
    try {
      const currentSchemaResult = (await this.db.executeQuery(
        'SELECT current_schema() AS schema'
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
        [currentSchema]
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
        [currentSchema]
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
        [currentSchema]
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
        [currentSchema]
      )) as IndexRow[];

      const data: DatabaseObject[] = [
        ...tables.map((object) => ({ name: object.name, type: 'table' as const })),
        ...views.map((object) => ({ name: object.name, type: 'view' as const })),
        ...routines.map((object) => ({ name: object.name, type: object.type })),
        ...indexes.map((object) => ({
          name: object.index_name,
          table: object.table_name,
          index_type: object.index_type,
          type: 'index' as const
        }))
      ];

      return {
        success: true,
        data
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

  async tableColumns(tableName: string): Promise<TableColumnsResult> {
    try {
      const columns = (await this.db.executeQuery(
        `
          SELECT column_name AS name, data_type AS type
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position
        `,
        [tableName]
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
}

export default new ListObjectsPgV1();
