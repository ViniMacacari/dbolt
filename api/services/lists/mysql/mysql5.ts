import MySQLV1 from '../../../models/mysql/mysql5.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  DatabaseSchemaEntry,
  DatabaseSchemaListResult,
  QueryRow
} from '../../../types.js';

type MySqlDatabaseRow = QueryRow & { Database: string };

class LSMySQL1 {
  private readonly db = new MySQLV1();
  private mainConfig: ReturnType<MySQLV1['getConfig']> | null = null;

  async listDatabasesAndSchemas(): Promise<DatabaseSchemaListResult> {
    if (this.db.getStatus() !== 'connected') {
      return {
        success: false,
        message: 'No active connection. Ensure the database is connected before querying.'
      };
    }

    try {
      if (!this.mainConfig) {
        this.mainConfig = this.db.getConfig();
      }

      const databases = (await this.db.executeQuery('SHOW DATABASES')) as MySqlDatabaseRow[];

      const results: DatabaseSchemaEntry[] = [];

      for (const databaseInfo of databases) {
        const databaseName = databaseInfo.Database;

        if (
          ['information_schema', 'mysql', 'performance_schema'].includes(
            databaseName
          )
        ) {
          continue;
        }

        results.push({
          database: databaseName,
          schemas: ['mysql']
        });
      }

      if (results.length > 0) {
        await this.db.connect({
          ...this.mainConfig,
          database: results[0].database
        });
      } else {
        await this.db.connect(this.mainConfig);
      }

      console.log('selected database', this.db.getConfig().database);
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

export default LSMySQL1;
