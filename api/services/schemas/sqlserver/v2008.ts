import sql from 'mssql';

import SQLServerV1 from '../../../models/sqlserver/v2008.js';
import { getErrorMessage } from '../../../utils/errors.js';

import type {
  QueryRow,
  SchemaChangeResult,
  SelectedSchemaResult,
  SqlServerQueryParameter
} from '../../../types.js';

type CurrentSchemaRow = QueryRow & {
  current_database: string;
  current_schema: string;
};

type SchemaExistsRow = QueryRow & { schema_name: string };

class SSSQLServerV1 {
  private readonly db = new SQLServerV1();
  private selectedSchema: string | null = null;

  async getSelectedSchema(): Promise<SelectedSchemaResult> {
    try {
      const result = (await this.db.executeQuery(`
        SELECT
            DB_NAME() AS current_database,
            SCHEMA_NAME() AS current_schema
      `)) as CurrentSchemaRow[];

      return {
        success: true,
        database: result[0].current_database,
        schema: this.selectedSchema ?? result[0].current_schema
      };
    } catch (error: unknown) {
      console.error('Error getting selected schema:', error);
      throw new Error('Failed to retrieve schema information from SQL Server');
    }
  }

  async setDatabaseAndSchema(
    schemaName?: string,
    databaseName?: string
  ): Promise<SchemaChangeResult> {
    try {
      if (!schemaName && !databaseName) {
        throw new Error('Either schema name or database name is required');
      }

      const schemaParameter: SqlServerQueryParameter[] = schemaName
        ? [{ name: 'schemaName', type: sql.NVarChar, value: schemaName }]
        : [];

      if (databaseName) {
        await this.db.disconnect();
        await this.db.connect({ ...this.db.getConfig(), database: databaseName });

        if (!schemaName) {
          const currentSchema = await this.getSelectedSchema();
          if (!currentSchema.success) {
            throw new Error(currentSchema.message);
          }
          this.selectedSchema = null;
          return {
            success: true,
            message: `Connected to database "${databaseName}" without setting a schema`,
            currentSchema
          };
        }

        const schemaExists = (await this.db.executeQuery(
          `
            SELECT name AS schema_name
            FROM sys.schemas
            WHERE name = @schemaName
          `,
          schemaParameter
        )) as SchemaExistsRow[];

        if (schemaExists.length === 0) {
          throw new Error(
            `Schema "${schemaName}" does not exist in the specified database "${databaseName}"`
          );
        }

        const currentSchema = await this.getSelectedSchema();
        if (!currentSchema.success) {
          throw new Error(currentSchema.message);
        }
        this.selectedSchema = schemaName;
        return {
          success: true,
          message: `Connected to database "${databaseName}" and schema "${schemaName}" verified successfully`,
          currentSchema
        };
      }

      const schemaExists = (await this.db.executeQuery(
        `
          SELECT name AS schema_name
          FROM sys.schemas
          WHERE name = @schemaName
        `,
        schemaParameter
      )) as SchemaExistsRow[];

      if (schemaExists.length === 0) {
        throw new Error(`Schema "${schemaName}" does not exist in the current database`);
      }

      const currentSchema = await this.getSelectedSchema();
      if (!currentSchema.success) {
        throw new Error(currentSchema.message);
      }
      this.selectedSchema = schemaName ?? null;

      return {
        success: true,
        message: `Schema "${schemaName}" verified in the current database`,
        currentSchema
      };
    } catch (error: unknown) {
      console.error('Error in setDatabaseAndSchema:', error);
      throw new Error(
        `Failed to set schema and database: ${getErrorMessage(error)}`
      );
    }
  }
}

export default new SSSQLServerV1();
