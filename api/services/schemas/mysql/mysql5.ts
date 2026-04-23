import MySQLV1 from '../../../models/mysql/mysql5.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  QueryRow,
  SchemaChangeResult,
  SelectedSchemaResult
} from '../../../types.js';

type CurrentDatabaseRow = QueryRow & { database: string | null };

class SSMySQLV1 {
  private readonly db = new MySQLV1();

  async getSelectedDatabase(): Promise<SelectedSchemaResult> {
    if (this.db.getStatus() !== 'connected') {
      console.log('Reconnecting to MySQL...');
      await this.db.connect(this.db.getConfig());
    }

    try {
      const result = (await this.db.executeQuery(
        'SELECT DATABASE() AS `database`'
      )) as CurrentDatabaseRow[];

      if (!result[0]?.database) {
        throw new Error('No database selected');
      }

      return { success: true, database: result[0].database, schema: 'mysql' };
    } catch (error: unknown) {
      throw new Error(`Not connected to MySQL: ${getErrorMessage(error)}`);
    }
  }

  async setDatabase(databaseName: string): Promise<SchemaChangeResult> {
    try {
      if (!databaseName) {
        throw new Error('Database name is required');
      }

      await this.db.disconnect();
      await this.db.connect({ ...this.db.getConfig(), database: databaseName });

      const currentDatabase = await this.getSelectedDatabase();
      if (!currentDatabase.success) {
        throw new Error(currentDatabase.message);
      }
      return {
        success: true,
        message: `Connected to database "${databaseName}" successfully`,
        currentDatabase
      };
    } catch (error: unknown) {
      throw new Error(`Failed to set database: ${getErrorMessage(error)}`);
    }
  }
}

export default new SSMySQLV1();
