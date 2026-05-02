import SQLiteV3 from '../../../models/sqlite/v3.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  SchemaChangeResult,
  SelectedSchemaResult
} from '../../../types.js';

class SSSQLiteV3 {
  private readonly db = new SQLiteV3();

  async getSelectedDatabase(connectionKey?: string): Promise<SelectedSchemaResult> {
    if (this.db.getStatus(connectionKey) !== 'connected') {
      await this.db.connect(this.db.getConfig(connectionKey), connectionKey);
    }

    try {
      const config = this.db.getConfig(connectionKey);
      return { success: true, database: config.database || config.filename || 'SQLite', schema: 'main' };
    } catch (error: unknown) {
      throw new Error(`Not connected to SQLite: ${getErrorMessage(error)}`);
    }
  }

  async setDatabase(_databaseName: string, connectionKey?: string): Promise<SchemaChangeResult> {
    try {
      const currentDatabase = await this.getSelectedDatabase(connectionKey);
      return {
        success: true,
        message: 'SQLite database is already selected',
        currentDatabase: currentDatabase.success
          ? { database: currentDatabase.database, schema: currentDatabase.schema }
          : undefined
      };
    } catch (error: unknown) {
      throw new Error(`Failed to set SQLite database: ${getErrorMessage(error)}`);
    }
  }
}

export default new SSSQLiteV3();
