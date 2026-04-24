import SQLServerV1 from '../../../models/sqlserver/v2008.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  DatabaseSchemaEntry,
  DatabaseSchemaListResult,
  QueryRow
} from '../../../types.js';

type DatabaseRow = QueryRow & { database_name: string };
type SchemaRow = QueryRow & { schema_name: string };

class LSSQLServer1 {
  private readonly db = new SQLServerV1();
  private mainConfig: ReturnType<SQLServerV1['getConfig']> | null = null;

  async listDatabasesAndSchemas(connectionKey?: string): Promise<DatabaseSchemaListResult> {
    if (this.db.getStatus(connectionKey) !== 'connected') {
      return {
        success: false,
        message: 'No active connection. Ensure the database is connected before querying.'
      };
    }

    const results: DatabaseSchemaEntry[] = [];
    let successfulConnections = 0;
    let totalConnections = 0;

    try {
      if (!this.mainConfig) {
        this.mainConfig = this.db.getConfig(connectionKey);
      }

      const databases = (await this.db.executeQuery(`
        SELECT name AS database_name
        FROM sys.databases
        WHERE name NOT IN ('tempdb', 'model', 'msdb')
        ORDER BY name
      `, [], connectionKey)) as DatabaseRow[];

      for (const databaseInfo of databases) {
        totalConnections += 1;

        try {
          await this.db.disconnect(connectionKey);
          await this.db.connect({
            ...this.mainConfig,
            database: databaseInfo.database_name
          }, connectionKey);

          const schemas = (await this.db.executeQuery(`
            SELECT name AS schema_name
            FROM sys.schemas
            WHERE name NOT IN (
              'sys',
              'guest',
              'INFORMATION_SCHEMA',
              'db_accessadmin',
              'db_backupoperator',
              'db_datareader',
              'db_datawriter',
              'db_ddladmin',
              'db_denydatareader',
              'db_denydatawriter',
              'db_owner',
              'db_securityadmin'
            )
            ORDER BY name
          `, [], connectionKey)) as SchemaRow[];

          results.push({
            database: databaseInfo.database_name,
            schemas: schemas.map((schema) => schema.schema_name)
          });

          successfulConnections += 1;
        } catch (error: unknown) {
          console.warn(
            `Failed to connect or query database: ${databaseInfo.database_name}`,
            getErrorMessage(error)
          );
        }
      }

      if (successfulConnections === 0) {
        return {
          success: false,
          message: `No databases could be accessed successfully. Tried ${totalConnections} databases.`
        };
      }

      return { success: true, data: results };
    } catch (error: unknown) {
      console.error('Error in listDatabasesAndSchemas:', error);
      return {
        success: false,
        message: 'An error occurred while listing databases and schemas.',
        error: getErrorMessage(error)
      };
    } finally {
      if (this.mainConfig) {
        try {
          await this.db.disconnect(connectionKey);
          await this.db.connect({ ...this.mainConfig }, connectionKey);
        } catch (finalError: unknown) {
          console.error(
            'Failed to reconnect to the main database:',
            getErrorMessage(finalError)
          );
        }
      }
    }
  }
}

export default LSSQLServer1;
