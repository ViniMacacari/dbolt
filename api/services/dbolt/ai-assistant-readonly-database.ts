import ListObjectsHanaV1 from '../database-info/hana/hana-v1.js';
import ListObjectsMySQLV1 from '../database-info/mysql/mysql5.js';
import ListObjectsPgV1 from '../database-info/postgres/v9.js';
import ListObjectsSQLServerV1 from '../database-info/sqlserver/v2008.js';
import ListObjectsSQLiteV3 from '../database-info/sqlite/v3.js';
import QueryHanaV1 from '../queries/hana/hana-v1.js';
import QueryMySQLV1 from '../queries/mysql/mysql5.js';
import QueryPgV1 from '../queries/postgres/v9.js';
import QuerySQLServerV1 from '../queries/sqlserver/v2008.js';
import QuerySQLiteV3 from '../queries/sqlite/v3.js';
import { isReadOnlySelectQuery, trimStatementTerminator } from '../../utils/sql-query.js';

import type {
  DatabaseObjectsResult,
  QueryExecutionResult,
  QueryRow,
  TableColumnsResult
} from '../../types.js';

const DEFAULT_OBJECT_LIMIT = 160;
const DEFAULT_COLUMN_LIMIT = 120;
const DEFAULT_SEARCH_LIMIT = 160;
const DEFAULT_QUERY_LIMIT = 50;
const MAX_OBJECT_LIMIT = 300;
const MAX_COLUMN_LIMIT = 200;
const MAX_SEARCH_LIMIT = 300;
const MAX_QUERY_LIMIT = 100;
const PROMPT_QUERY_ROW_LIMIT = 15;
const PROMPT_QUERY_COLUMN_LIMIT = 20;
const PROMPT_VALUE_LIMIT = 160;

type DatabaseObjectType = 'table' | 'view';

type DatabaseInfoProvider = {
  listTableObjects: (connectionKey?: string) => Promise<DatabaseObjectsResult>;
  tableColumns: (tableName: string, connectionKey?: string) => Promise<TableColumnsResult>;
};

type DatabaseQueryProvider = {
  query: (sql: string, maxLines?: number | null, connectionKey?: string) => Promise<QueryExecutionResult>;
};

export interface AiReadonlyDatabaseContext {
  sgbd?: string;
  version?: string;
  database?: string;
  schema?: string;
  connectionKey?: string;
}

export interface AiReadonlySchemaSummary {
  connection: Omit<AiReadonlyDatabaseContext, 'connectionKey'>;
  counts: {
    tables: number;
    views: number;
  };
  tables: Array<{ name: string; type?: string }>;
  views: Array<{ name: string; type?: string }>;
  truncated: boolean;
}

export interface AiReadonlyTableColumns {
  tableName: string;
  columns: QueryRow[];
  totalColumns: number;
  truncated: boolean;
}

export interface AiReadonlyObjectSearch {
  connection: Omit<AiReadonlyDatabaseContext, 'connectionKey'>;
  query: string;
  types: DatabaseObjectType[];
  counts: {
    tables: number;
    views: number;
  };
  totalMatches: number;
  matches: Array<{ name: string; type: DatabaseObjectType }>;
  truncated: boolean;
}

export interface AiReadonlyQueryExecution {
  sql: string;
  database?: string;
  columns: string[];
  rows: QueryRow[];
  returnedRows: number;
  totalRows: number | null;
  truncated: boolean;
}

class AiAssistantReadonlyDatabaseService {
  async getSchemaSummary(
    context: AiReadonlyDatabaseContext,
    limit = DEFAULT_OBJECT_LIMIT,
    search = ''
  ): Promise<AiReadonlySchemaSummary> {
    const provider = this.getDatabaseInfoProvider(context);
    const normalizedLimit = this.normalizeLimit(limit, DEFAULT_OBJECT_LIMIT, MAX_OBJECT_LIMIT);
    const result = await provider.listTableObjects(context.connectionKey);

    if (!result.success) {
      throw new Error(this.getServiceErrorMessage(result, 'Could not query database objects.'));
    }

    const normalizedSearch = search.trim().toLowerCase();
    const tables = (result.tables || [])
      .filter((object) => this.matchesSearch(object.name, normalizedSearch))
      .map((object) => ({ name: object.name, type: object.type }));
    const views = (result.views || [])
      .filter((object) => this.matchesSearch(object.name, normalizedSearch))
      .map((object) => ({ name: object.name, type: object.type }));

    return {
      connection: this.toPublicContext(context),
      counts: {
        tables: result.tables?.length || 0,
        views: result.views?.length || 0
      },
      tables: tables.slice(0, normalizedLimit),
      views: views.slice(0, normalizedLimit),
      truncated: tables.length > normalizedLimit || views.length > normalizedLimit
    };
  }

  async getTableColumns(
    context: AiReadonlyDatabaseContext,
    tableName: string,
    limit = DEFAULT_COLUMN_LIMIT
  ): Promise<AiReadonlyTableColumns> {
    const normalizedTableName = tableName.trim();
    if (!normalizedTableName) {
      throw new Error('Table name was not provided.');
    }

    const provider = this.getDatabaseInfoProvider(context);
    const normalizedLimit = this.normalizeLimit(limit, DEFAULT_COLUMN_LIMIT, MAX_COLUMN_LIMIT);
    const result = await provider.tableColumns(normalizedTableName, context.connectionKey);

    if (!result.success) {
      throw new Error(this.getServiceErrorMessage(result, 'Could not query table columns.'));
    }

    const columns = (result.data || []) as QueryRow[];

    return {
      tableName: normalizedTableName,
      columns: columns.slice(0, normalizedLimit),
      totalColumns: columns.length,
      truncated: columns.length > normalizedLimit
    };
  }

  async searchObjects(
    context: AiReadonlyDatabaseContext,
    search: string,
    limit = DEFAULT_SEARCH_LIMIT,
    types?: DatabaseObjectType[]
  ): Promise<AiReadonlyObjectSearch> {
    const normalizedSearch = String(search || '').trim();
    if (!normalizedSearch) {
      throw new Error('Search term was not provided.');
    }

    const normalizedLimit = this.normalizeLimit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    const typeSet = new Set<DatabaseObjectType>((types?.length ? types : ['table', 'view']));
    const objects = await this.loadTableObjects(context);
    const normalizedSearchText = normalizedSearch.toLowerCase();
    const matches = [
      ...objects.tables.map((object) => ({ name: object.name, type: 'table' as const })),
      ...objects.views.map((object) => ({ name: object.name, type: 'view' as const }))
    ].filter((object) =>
      typeSet.has(object.type) && object.name.toLowerCase().includes(normalizedSearchText)
    );

    return {
      connection: this.toPublicContext(context),
      query: normalizedSearch,
      types: [...typeSet],
      counts: {
        tables: objects.tables.length,
        views: objects.views.length
      },
      totalMatches: matches.length,
      matches: matches.slice(0, normalizedLimit),
      truncated: matches.length > normalizedLimit
    };
  }

  async runReadOnlyQuery(
    context: AiReadonlyDatabaseContext,
    sql: string,
    maxRows = DEFAULT_QUERY_LIMIT
  ): Promise<AiReadonlyQueryExecution> {
    const executableSql = this.normalizeReadOnlySql(sql);
    const rowLimit = this.normalizeLimit(maxRows, DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);
    const provider = this.getDatabaseQueryProvider(context);
    const result = await provider.query(executableSql, rowLimit, context.connectionKey);

    if (!result.success) {
      throw new Error(this.getServiceErrorMessage(result, 'Could not execute the read-only query.'));
    }

    const rows = Array.isArray(result.result) ? result.result as QueryRow[] : [];
    const columns = (result.columns?.length ? result.columns : this.extractColumns(rows)).slice(0, PROMPT_QUERY_COLUMN_LIMIT);

    return {
      sql: executableSql,
      database: result.database,
      columns,
      rows: this.compactRows(rows, PROMPT_QUERY_ROW_LIMIT, PROMPT_QUERY_COLUMN_LIMIT),
      returnedRows: rows.length,
      totalRows: result.totalRows ?? null,
      truncated: (result.totalRows ?? rows.length) > rows.length || rows.length > PROMPT_QUERY_ROW_LIMIT
    };
  }

  private async loadTableObjects(context: AiReadonlyDatabaseContext): Promise<{
    tables: Array<{ name: string; type?: string }>;
    views: Array<{ name: string; type?: string }>;
  }> {
    const provider = this.getDatabaseInfoProvider(context);
    const result = await provider.listTableObjects(context.connectionKey);

    if (!result.success) {
      throw new Error(this.getServiceErrorMessage(result, 'Could not query database objects.'));
    }

    return {
      tables: (result.tables || []).map((object) => ({ name: object.name, type: object.type })),
      views: (result.views || []).map((object) => ({ name: object.name, type: object.type }))
    };
  }

  private normalizeReadOnlySql(sql: string): string {
    const executableSql = trimStatementTerminator(String(sql || '').trim());

    if (!executableSql) {
      throw new Error('SQL was not provided.');
    }

    if (!isReadOnlySelectQuery(executableSql)) {
      throw new Error('The AI can only execute read-only queries starting with SELECT or WITH.');
    }

    if (this.hasAdditionalSqlStatements(executableSql)) {
      throw new Error('The AI can only execute one read-only query at a time.');
    }

    if (this.containsBlockedSqlKeyword(executableSql)) {
      throw new Error('The query contains a command that is not allowed in read-only mode.');
    }

    return executableSql;
  }

  private hasAdditionalSqlStatements(sql: string): boolean {
    for (let index = 0; index < sql.length; index++) {
      const char = sql[index];
      const next = sql[index + 1];

      if (char === '-' && next === '-') {
        index += 2;
        while (index < sql.length && sql[index] !== '\n') index++;
        continue;
      }

      if (char === '/' && next === '*') {
        index += 2;
        while (index < sql.length && !(sql[index] === '*' && sql[index + 1] === '/')) index++;
        index++;
        continue;
      }

      if (char === '\'' || char === '"' || char === '`') {
        index = this.skipQuotedSql(sql, index, char) - 1;
        continue;
      }

      if (char === '[') {
        index = this.skipBracketIdentifier(sql, index) - 1;
        continue;
      }

      if (char === ';' && sql.slice(index + 1).replace(/;+$/g, '').trim().length > 0) {
        return true;
      }
    }

    return false;
  }

  private containsBlockedSqlKeyword(sql: string): boolean {
    const scanText = this.stripSqlStringsAndComments(sql).toLowerCase();
    return /\b(insert|update|delete|merge|create|alter|drop|truncate|exec|execute|call|grant|revoke|set|use)\b/.test(scanText);
  }

  private stripSqlStringsAndComments(sql: string): string {
    let result = '';

    for (let index = 0; index < sql.length; index++) {
      const char = sql[index];
      const next = sql[index + 1];

      if (char === '-' && next === '-') {
        index += 2;
        while (index < sql.length && sql[index] !== '\n') index++;
        result += ' ';
        continue;
      }

      if (char === '/' && next === '*') {
        index += 2;
        while (index < sql.length && !(sql[index] === '*' && sql[index + 1] === '/')) index++;
        index++;
        result += ' ';
        continue;
      }

      if (char === '\'' || char === '"' || char === '`') {
        index = this.skipQuotedSql(sql, index, char) - 1;
        result += ' ';
        continue;
      }

      if (char === '[') {
        index = this.skipBracketIdentifier(sql, index) - 1;
        result += ' ';
        continue;
      }

      result += char;
    }

    return result;
  }

  private skipQuotedSql(sql: string, start: number, quote: string): number {
    let index = start + 1;

    while (index < sql.length) {
      if (sql[index] === quote) {
        if (sql[index + 1] === quote) {
          index += 2;
          continue;
        }

        return index + 1;
      }

      index++;
    }

    return index;
  }

  private skipBracketIdentifier(sql: string, start: number): number {
    let index = start + 1;

    while (index < sql.length && sql[index] !== ']') {
      index++;
    }

    return index + 1;
  }

  private compactRows(rows: QueryRow[], maxRows: number, maxColumns: number): QueryRow[] {
    return rows.slice(0, maxRows).map((row) => {
      const compactRow: QueryRow = {};

      Object.keys(row).slice(0, maxColumns).forEach((key) => {
        compactRow[key] = this.toPromptValue(row[key]);
      });

      return compactRow;
    });
  }

  private toPromptValue(value: QueryRow[keyof QueryRow]): QueryRow[keyof QueryRow] {
    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Buffer.isBuffer(value)) {
      return `<Buffer ${value.length} bytes>`;
    }

    if (value instanceof Uint8Array) {
      return `<Uint8Array ${value.length} bytes>`;
    }

    if (Array.isArray(value)) {
      return this.truncateText(JSON.stringify(value, this.jsonReplacer), PROMPT_VALUE_LIMIT);
    }

    if (value && typeof value === 'object') {
      return this.truncateText(JSON.stringify(value, this.jsonReplacer), PROMPT_VALUE_LIMIT);
    }

    if (typeof value === 'string') {
      return this.truncateText(value, PROMPT_VALUE_LIMIT);
    }

    return value;
  }

  private jsonReplacer(_key: string, value: unknown): unknown {
    return typeof value === 'bigint' ? value.toString() : value;
  }

  private extractColumns(rows: QueryRow[]): string[] {
    return rows[0] ? Object.keys(rows[0]) : [];
  }

  private truncateText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength)}...`;
  }

  private getDatabaseInfoProvider(context: AiReadonlyDatabaseContext): DatabaseInfoProvider {
    const database = String(context.sgbd || '').toLowerCase();

    if (database === 'hana') return ListObjectsHanaV1;
    if (database === 'mysql') return ListObjectsMySQLV1;
    if (database === 'postgres') return ListObjectsPgV1;
    if (database === 'sqlserver') return ListObjectsSQLServerV1;
    if (database === 'sqlite') return ListObjectsSQLiteV3;

    throw new Error(`Database not supported by the AI read-only context: ${context.sgbd || 'unknown'}`);
  }

  private getDatabaseQueryProvider(context: AiReadonlyDatabaseContext): DatabaseQueryProvider {
    const database = String(context.sgbd || '').toLowerCase();

    if (database === 'hana') return QueryHanaV1;
    if (database === 'mysql') return QueryMySQLV1;
    if (database === 'postgres') return QueryPgV1;
    if (database === 'sqlserver') return QuerySQLServerV1;
    if (database === 'sqlite') return QuerySQLiteV3;

    throw new Error(`Database not supported for AI read-only queries: ${context.sgbd || 'unknown'}`);
  }

  private normalizeLimit(limit: number, fallback: number, max: number): number {
    if (!Number.isFinite(limit)) {
      return fallback;
    }

    return Math.max(1, Math.min(max, Math.floor(limit)));
  }

  private matchesSearch(value: string, search: string): boolean {
    return !search || value.toLowerCase().includes(search);
  }

  private toPublicContext(context: AiReadonlyDatabaseContext): Omit<AiReadonlyDatabaseContext, 'connectionKey'> {
    return {
      sgbd: context.sgbd,
      version: context.version,
      database: context.database,
      schema: context.schema
    };
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getServiceErrorMessage(result: unknown, fallback: string): string {
    if (result && typeof result === 'object') {
      const record = result as Record<string, unknown>;
      const message = record['message'];
      const error = record['error'];

      if (typeof error === 'string' && error.trim()) return error;
      if (typeof message === 'string' && message.trim()) return message;
    }

    return fallback;
  }
}

export default new AiAssistantReadonlyDatabaseService();
