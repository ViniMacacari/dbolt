import HanaV1 from '../../../models/hana/hana-v1.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  QueryRow,
  ConnectionServiceResult,
  SelectedSchemaResult
} from '../../../types.js';

type CurrentSchemaRow = QueryRow & { schema: string };

class SSchemaHanaV1 {
  private readonly db = new HanaV1();

  async getSelectedSchema(connectionKey?: string): Promise<SelectedSchemaResult> {
    try {
      const result = (await this.db.executeQuery(
        'SELECT CURRENT_SCHEMA AS "schema" FROM DUMMY',
        [],
        connectionKey
      )) as CurrentSchemaRow[];

      return { success: true, database: 'Hana', schema: result[0].schema };
    } catch {
      throw new Error('Not connected to HANA');
    }
  }

  async setSchema(schemaName: string, connectionKey?: string): Promise<ConnectionServiceResult> {
    try {
      if (!schemaName) {
        throw new Error('Schema name is required');
      }

      await this.db.executeQuery(`SET SCHEMA ${schemaName}`, [], connectionKey);

      return { success: true, message: `Schema changed to ${schemaName}` };
    } catch (error: unknown) {
      throw new Error(`Failed to set schema: ${getErrorMessage(error)}`);
    }
  }
}

export default new SSchemaHanaV1();
