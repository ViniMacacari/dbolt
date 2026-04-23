import MySQLV1 from '../../../models/mysql/mysql5.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  ConnectionServiceResult,
  DatabaseConnectionConfig
} from '../../../types.js';

class SMySQLV1 {
  async testConnection(
    config: DatabaseConnectionConfig
  ): Promise<ConnectionServiceResult> {
    const db = new MySQLV1();

    try {
      await db.connect(config);
      await db.disconnect();
      return { success: true, message: 'Connection successfully established!' };
    } catch (error: unknown) {
      console.error('Error to connect:', error);
      await db.disconnect();
      return {
        success: false,
        message: 'Failed to connect to MySQL',
        error: getErrorMessage(error)
      };
    }
  }

  async connection(
    config: DatabaseConnectionConfig
  ): Promise<ConnectionServiceResult> {
    const db = new MySQLV1();

    try {
      await db.connect(config);
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
