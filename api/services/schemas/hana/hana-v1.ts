import HanaV1 from '../../../models/hana/hana-v1.js';
import { getErrorMessage } from '../../../utils/errors.js';
import { normalizeIdentifier, quoteSafeIdentifier } from '../../../utils/sql-identifiers.js';

import type {
  QueryRow,
  ConnectionServiceResult,
  SelectedSchemaResult
} from '../../../types.js';

type CurrentSchemaRow = QueryRow & { schema: string };
type SchemaExistsRow = QueryRow & { schema_name: string };

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
      const normalizedSchemaName = normalizeIdentifier(schemaName, 'Schema name');
      const schemaExists = (await this.db.executeQuery(
        `
          SELECT SCHEMA_NAME AS "schema_name"
          FROM SYS.SCHEMAS
          WHERE SCHEMA_NAME = ?
        `,
        [normalizedSchemaName],
        connectionKey
      )) as SchemaExistsRow[];

      if (schemaExists.length === 0) {
        throw new Error(`Schema "${normalizedSchemaName}" does not exist`);
      }

      await this.db.executeQuery(`SET SCHEMA ${quoteSafeIdentifier(normalizedSchemaName, '"', 'Schema name')}`, [], connectionKey);

      return { success: true, message: `Schema changed to ${normalizedSchemaName}` };
    } catch (error: unknown) {
      throw new Error(`Failed to set schema: ${getErrorMessage(error)}`);
    }
  }
}

export default new SSchemaHanaV1();
