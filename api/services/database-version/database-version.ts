import HanaV1 from '../../models/hana/hana-v1.js';
import MySQLV1 from '../../models/mysql/mysql5.js';
import PgV1 from '../../models/postgres/v9.js';
import SQLiteV3 from '../../models/sqlite/v3.js';
import SQLServerV1 from '../../models/sqlserver/v2008.js';

import type {
  DatabaseConnectionConfig,
  DatabaseVersionResult,
  HanaConnectionConfig,
  QueryRows,
  QueryRowValue,
  SqlServerConnectionConfig
} from '../../types.js';

type VersionDatabase = {
  connect: (config: any, connectionKey?: string) => Promise<unknown>;
  executeQuery: (query: string, params?: any, connectionKey?: string) => Promise<QueryRows>;
  disconnect: (connectionKey?: string) => Promise<void>;
};

class DatabaseVersionService {
  private readonly unknownVersion = 'Unknown database version';

  async mysql(config: DatabaseConnectionConfig): Promise<DatabaseVersionResult> {
    return this.fetchVersion(new MySQLV1(), config, [
      'SELECT VERSION() AS version'
    ]);
  }

  async postgres(config: DatabaseConnectionConfig): Promise<DatabaseVersionResult> {
    return this.fetchVersion(new PgV1(), config, [
      'SHOW server_version',
      'SELECT version() AS version'
    ]);
  }

  async sqlServer(config: SqlServerConnectionConfig): Promise<DatabaseVersionResult> {
    return this.fetchVersion(new SQLServerV1(), config, [
      "SELECT CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(128)) AS version",
      'SELECT @@VERSION AS version'
    ]);
  }

  async sqlite(config: Partial<DatabaseConnectionConfig>): Promise<DatabaseVersionResult> {
    return this.fetchVersion(new SQLiteV3(), config, [
      'SELECT sqlite_version() AS version'
    ]);
  }

  async hana(config: HanaConnectionConfig): Promise<DatabaseVersionResult> {
    return this.fetchVersion(new HanaV1(), config, [
      'SELECT VERSION AS "version" FROM SYS.M_DATABASE',
      'SELECT VERSION FROM M_DATABASE'
    ]);
  }

  private async fetchVersion(
    db: VersionDatabase,
    config: unknown,
    queries: string[]
  ): Promise<DatabaseVersionResult> {
    const key = `database-version-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
      await db.connect(config, key);

      for (const query of queries) {
        try {
          const rows = await db.executeQuery(query, [], key);
          const version = this.extractVersion(rows);
          if (version) {
            return {
              success: true,
              version
            };
          }
        } catch (error: unknown) {
          console.warn('Could not resolve database version with query:', query, error);
        }
      }

      return this.unknownResult();
    } catch (error: unknown) {
      console.warn('Could not resolve database version:', error);
      return this.unknownResult();
    } finally {
      await db.disconnect(key).catch(() => undefined);
    }
  }

  private extractVersion(rows: QueryRows): string {
    const keys = [
      'version',
      'VERSION',
      'server_version',
      'SERVER_VERSION',
      'ProductVersion',
      'PRODUCTVERSION',
      'sqlite_version()'
    ];

    for (const row of rows) {
      for (const key of keys) {
        const version = this.stringifyVersion(row[key]);
        if (version) return version;
      }

      for (const value of Object.values(row)) {
        const version = this.stringifyVersion(value);
        if (version) return version;
      }
    }

    return '';
  }

  private stringifyVersion(value: QueryRowValue): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return value.toString('utf8').trim();
    if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8').trim();
    if (typeof value === 'object') return '';

    return String(value).trim();
  }

  private unknownResult(): DatabaseVersionResult {
    return {
      success: true,
      version: this.unknownVersion
    };
  }
}

export default new DatabaseVersionService();
