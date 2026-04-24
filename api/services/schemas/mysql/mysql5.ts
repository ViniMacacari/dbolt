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

  async getSelectedDatabase(connectionKey?: string): Promise<SelectedSchemaResult> {
    if (this.db.getStatus(connectionKey) !== 'connected') {
      console.log('Reconnecting to MySQL...');
      await this.db.connect(this.db.getConfig(connectionKey), connectionKey);
    }

    try {
      const result = (await this.db.executeQuery(
        'SELECT DATABASE() AS `database`',
        [],
        connectionKey
      )) as CurrentDatabaseRow[];

      if (!result[0]?.database) {
        throw new Error('No database selected');
      }

      return { success: true, database: result[0].database, schema: 'mysql' };
    } catch (error: unknown) {
      throw new Error(`Not connected to MySQL: ${getErrorMessage(error)}`);
    }
  }

  async setDatabase(databaseName: string, connectionKey?: string): Promise<SchemaChangeResult> {
    try {
      if (!databaseName) {
        throw new Error('Database name is required');
      }

      const config = this.db.getConfig(connectionKey);
      await this.db.disconnect(connectionKey);
      await this.db.connect({ ...config, database: databaseName }, connectionKey);

      const currentDatabase = await this.getSelectedDatabase(connectionKey);
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
