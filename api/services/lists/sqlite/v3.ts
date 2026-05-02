import SQLiteV3 from '../../../models/sqlite/v3.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  DatabaseSchemaEntry,
  DatabaseSchemaListResult
} from '../../../types.js';

class LSQLiteV3 {
  private readonly db = new SQLiteV3();

  async listDatabasesAndSchemas(connectionKey?: string): Promise<DatabaseSchemaListResult> {
    if (this.db.getStatus(connectionKey) !== 'connected') {
      return {
        success: false,
        message: 'No active connection. Ensure the database is connected before querying.'
      };
    }

    try {
      const config = this.db.getConfig(connectionKey);
      const data: DatabaseSchemaEntry[] = [{
        database: config.database || config.filename || 'SQLite',
        schemas: ['main']
      }];

      return { success: true, data };
    } catch (error: unknown) {
      console.error('Error in listDatabasesAndSchemas:', error);
      return {
        success: false,
        message: 'Error occurred while listing SQLite databases and schemas.',
        error: getErrorMessage(error)
      };
    }
  }
}

export default LSQLiteV3;
