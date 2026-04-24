import PgV1 from '../../../models/postgres/v9.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  DatabaseSchemaEntry,
  DatabaseSchemaListResult,
  QueryRow
} from '../../../types.js';

type DatabaseRow = QueryRow & { database_name: string };
type SchemaRow = QueryRow & { schema_name: string };

class LSPg1 {
  private readonly db = new PgV1();
  private mainConfig: ReturnType<PgV1['getConfig']> | null = null;

  async listDatabasesAndSchemas(connectionKey?: string): Promise<DatabaseSchemaListResult> {
    if (this.db.getStatus(connectionKey) !== 'connected') {
      return {
        success: false,
        message: 'No active connection. Ensure the database is connected before querying.'
      };
    }

    try {
      if (!this.mainConfig) {
        this.mainConfig = this.db.getConfig(connectionKey);
      }

      const currentDatabase = this.mainConfig.database;
      const databases = (await this.db.executeQuery(`
        SELECT datname AS database_name
        FROM pg_database
        WHERE datistemplate = false
        ORDER BY 1
      `, [], connectionKey)) as DatabaseRow[];

      const results: DatabaseSchemaEntry[] = [];

      for (const databaseInfo of databases) {
        await this.db.disconnect(connectionKey);
        await this.db.connect({
          ...this.mainConfig,
          database: databaseInfo.database_name
        }, connectionKey);

        const schemas = (await this.db.executeQuery(`
          SELECT schema_name
          FROM information_schema.schemata
          WHERE schema_name NOT LIKE 'pg_%' AND schema_name NOT LIKE 'information_schema'
          ORDER BY 1
        `, [], connectionKey)) as SchemaRow[];

        results.push({
          database: databaseInfo.database_name,
          schemas: schemas.map((schema) => schema.schema_name)
        });
      }

      await this.db.disconnect(connectionKey);
      await this.db.connect({ ...this.mainConfig, database: currentDatabase }, connectionKey);

      return { success: true, data: results };
    } catch (error: unknown) {
      console.error('Error in listDatabasesAndSchemas:', error);
      return {
        success: false,
        message: 'Error occurred while listing databases and schemas.',
        error: getErrorMessage(error)
      };
    }
  }
}

export default LSPg1;
