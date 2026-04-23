import SQLServerV1 from '../../../models/sqlserver/v2008.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  ConnectionServiceResult,
  SqlServerConnectionConfig
} from '../../../types.js';

class SSQLServerV1 {
  async testConnection(
    config: SqlServerConnectionConfig
  ): Promise<ConnectionServiceResult> {
    const db = new SQLServerV1();

    try {
      await db.connect(config);
      await db.disconnect();
      return { success: true, message: 'Connection successfully established!' };
    } catch (error: unknown) {
      console.error('Error connecting to SQL Server:', error);
      await db.disconnect();
      return {
        success: false,
        message: 'Failed to connect to SQL Server',
        error: getErrorMessage(error)
      };
    }
  }

  async connection(
    config: SqlServerConnectionConfig
  ): Promise<ConnectionServiceResult> {
    const db = new SQLServerV1();

    try {
      await db.connect(config);
      return { success: true, message: 'Connection successfully established!' };
    } catch (error: unknown) {
      console.error('Error connecting to SQL Server:', error);
      return {
        success: false,
        message: 'Failed to connect to SQL Server',
        error: getErrorMessage(error)
      };
    }
  }
}

export default new SSQLServerV1();
