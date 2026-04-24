import HanaV1 from '../../../models/hana/hana-v1.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  DatabaseSchemaListResult,
  QueryRow
} from '../../../types.js';

type HanaSchemaRow = QueryRow & { SCHEMA_NAME: string };

class LSHanaV1 {
  private readonly db = new HanaV1();

  async listDatabasesAndSchemas(connectionKey?: string): Promise<DatabaseSchemaListResult> {
    if (this.db.getStatus(connectionKey) !== 'connected') {
      return {
        success: false,
        message: 'No active connection. Ensure the database is connected before querying.'
      };
    }

    try {
      const schemas = (await this.db.executeQuery(`
        SELECT SCHEMA_NAME
        FROM SYS.SCHEMAS
        WHERE SCHEMA_NAME NOT LIKE '_SYS_%'
          AND SCHEMA_NAME NOT LIKE 'SAP_%'
          AND SCHEMA_NAME NOT IN (
              'SYS', 'SYSTEM', 'HANACLEANER', 'RSP', 'HANA_XS_BASE'
          )
        ORDER BY 1
      `, [], connectionKey)) as HanaSchemaRow[];

      return {
        success: true,
        data: [
          {
            database: 'Hana',
            schemas: schemas.map((schema) => schema.SCHEMA_NAME)
          }
        ]
      };
    } catch (error: unknown) {
      console.error('Error in listSchemas:', error);
      return {
        success: false,
        message: 'Error occurred while listing schemas.',
        error: getErrorMessage(error)
      };
    }
  }
}

export default LSHanaV1;
