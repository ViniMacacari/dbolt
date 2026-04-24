import MySQLV1 from '../../../models/mysql/mysql5.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  ConnectionServiceResult,
  DatabaseConnectionConfig
} from '../../../types.js';

class SMySQLV1 {
  async testConnection(
    config: DatabaseConnectionConfig,
    connectionKey?: string
  ): Promise<ConnectionServiceResult> {
    const db = new MySQLV1();

    try {
      await db.connect(config, connectionKey);
      await db.disconnect(connectionKey);
      return { success: true, message: 'Connection successfully established!' };
    } catch (error: unknown) {
      console.error('Error to connect:', error);
      await db.disconnect(connectionKey);
      return {
        success: false,
        message: 'Failed to connect to MySQL',
        error: getErrorMessage(error)
      };
    }
  }

  async connection(
    config: DatabaseConnectionConfig,
    connectionKey?: string
  ): Promise<ConnectionServiceResult> {
    const db = new MySQLV1();

    try {
      await db.connect(config, connectionKey);
      return { success: true, message: 'Connection successfully established!' };
    } catch (error: unknown) {
      console.error('Error to connect:', error);
      return {
        success: false,
        message: 'Failed to connect to MySQL',
        error: getErrorMessage(error)
      };
    }
  }
}

export default new SMySQLV1();
