import HanaV1 from '../../../models/hana/hana-v1.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  ConnectionServiceResult,
  HanaConnectionConfig
} from '../../../types.js';

class SHanaV1 {
  async testConnection(
    config: HanaConnectionConfig,
    connectionKey?: string
  ): Promise<ConnectionServiceResult> {
    const db = new HanaV1();

    try {
      await db.connect(config, connectionKey);
      await db.disconnect(connectionKey);
      return { success: true, message: 'Connection successfully established!' };
    } catch (error: unknown) {
      console.error('Error to connect:', error);
      return {
        success: false,
        message: 'Failed to connect to Hana',
        error: getErrorMessage(error)
      };
    }
  }

  async connection(
    config: HanaConnectionConfig,
    connectionKey?: string
  ): Promise<ConnectionServiceResult> {
    const db = new HanaV1();

    try {
      await db.connect(config, connectionKey);
      return { success: true, message: 'Connection successfully established!' };
    } catch (error: unknown) {
      console.error('Error to connect:', error);
      return {
        success: false,
        message: 'Failed to connect to Hana',
        error: getErrorMessage(error)
      };
    }
  }
}

export default new SHanaV1();
