import PgV1 from '../../../models/postgres/v9.js';
import { getErrorMessage } from '../../../utils/errors.js';
import { normalizeIdentifier, quoteSafeIdentifier } from '../../../utils/sql-identifiers.js';

import type {
  QueryRow,
  SchemaChangeResult,
  SelectedSchemaResult
} from '../../../types.js';

type CurrentSchemaRow = QueryRow & { database: string; schema: string };
type SchemaExistsRow = QueryRow & { schema_name: string };

class SSPgV1 {
  private readonly db = new PgV1();

  async getSelectedSchema(connectionKey?: string): Promise<SelectedSchemaResult> {
    try {
      const result = (await this.db.executeQuery(
        'SELECT current_database() as "database", current_schema() as "schema"',
        [],
        connectionKey
      )) as CurrentSchemaRow[];

      return {
        success: true,
        database: result[0].database,
        schema: result[0].schema
      };
    } catch {
      throw new Error('Not connected to PostgreSQL');
    }
  }

  async setDatabaseAndSchema(
    schemaName?: string,
    databaseName?: string,
    connectionKey?: string
  ): Promise<SchemaChangeResult> {
    try {
      if (!schemaName && !databaseName) {
        throw new Error('Either schema name or database name is required');
      }

      const normalizedSchemaName = schemaName
        ? normalizeIdentifier(schemaName, 'Schema name')
        : undefined;

      if (databaseName) {
        const config = this.db.getConfig(connectionKey);
        await this.db.disconnect(connectionKey);
        await this.db.connect({ ...config, database: databaseName }, connectionKey);

        if (!normalizedSchemaName) {
          const currentSchema = await this.getSelectedSchema(connectionKey);
          if (!currentSchema.success) {
            throw new Error(currentSchema.message);
          }
          return {
            success: true,
            message: `Connected to database "${databaseName}" without setting a schema`,
            currentSchema
          };
        }

        const schemaExistsInNewDb = (await this.db.executeQuery(
          `
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name = $1
          `,
          [normalizedSchemaName],
          connectionKey
        )) as SchemaExistsRow[];

        if (schemaExistsInNewDb.length === 0) {
          throw new Error(
            `Schema "${normalizedSchemaName}" does not exist in the specified database "${databaseName}"`
          );
        }

        await this.db.executeQuery(`SET search_path TO ${quoteSafeIdentifier(normalizedSchemaName, '"', 'Schema name')}`, [], connectionKey);
        const currentSchema = await this.getSelectedSchema(connectionKey);
        if (!currentSchema.success) {
          throw new Error(currentSchema.message);
        }

        return {
          success: true,
          message: `Connected to database "${databaseName}" and schema "${normalizedSchemaName}" set successfully`,
          currentSchema
        };
      }

      const schemaExists = (await this.db.executeQuery(
        `
          SELECT schema_name
          FROM information_schema.schemata
          WHERE schema_name = $1
        `,
        [normalizedSchemaName],
        connectionKey
      )) as SchemaExistsRow[];

      if (schemaExists.length === 0) {
        throw new Error(`Schema "${normalizedSchemaName}" does not exist in the current database`);
      }

      await this.db.executeQuery(`SET search_path TO ${quoteSafeIdentifier(normalizedSchemaName, '"', 'Schema name')}`, [], connectionKey);
      const currentSchema = await this.getSelectedSchema(connectionKey);
      if (!currentSchema.success) {
        throw new Error(currentSchema.message);
      }

      return {
        success: true,
        message: `Schema "${normalizedSchemaName}" set in the current database`,
        currentSchema
      };
    } catch (error: unknown) {
      throw new Error(
        `Failed to set schema and database: ${getErrorMessage(error)}`
      );
    }
  }
}

export default new SSPgV1();
