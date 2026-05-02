import SQLiteV3 from '../../../models/sqlite/v3.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  ConnectionServiceResult,
  DatabaseConnectionConfig
} from '../../../types.js';

class SSQLiteV3 {
  async testConnection(
    config: Partial<DatabaseConnectionConfig>,
    connectionKey?: string
  ): Promise<ConnectionServiceResult> {
    const db = new SQLiteV3();

    try {
      await db.connect(config, connectionKey);
      await db.disconnect(connectionKey);
      return { success: true, message: 'Connection successfully established!' };
    } catch (error: unknown) {
      console.error('Error to connect:', error);
      await db.disconnect(connectionKey);
      return {
        success: false,
        message: 'Failed to connect to SQLite',
        error: getErrorMessage(error)
      };
    }
  }

  async connection(
    config: Partial<DatabaseConnectionConfig>,
    connectionKey?: string
  ): Promise<ConnectionServiceResult> {
    const db = new SQLiteV3();

    try {
      await db.connect(config, connectionKey);
      return { success: true, message: 'Connection successfully established!' };
    } catch (error: unknown) {
      console.error('Error to connect:', error);
      return {
        success: false,
        message: 'Failed to connect to SQLite',
        error: getErrorMessage(error)
      };
    }
  }
}

export default new SSQLiteV3();
