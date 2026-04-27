import type { ISqlType } from 'mssql';

export type SupportedDatabase = 'Hana' | 'Postgres' | 'MySQL' | 'SqlServer';
export type ConnectionStatus = 'connected' | 'disconnected';
export type NumericLike = number | `${number}`;

export type QueryScalar =
  | string
  | number
  | boolean
  | bigint
  | Date
  | Buffer
  | Uint8Array
  | null
  | undefined;

export type QueryRowValue =
  | QueryScalar
  | QueryScalar[]
  | Record<string, unknown>
  | Array<Record<string, unknown>>;

export type QueryRow = Record<string, QueryRowValue>;
export type QueryRows = QueryRow[];

export interface DatabaseConnectionConfig {
  host: string;
  port: NumericLike;
  user: string;
  password: string;
  database?: string;
}

export interface ConnectionContextPayload {
  connectionKey?: string;
}

export interface SqlServerConnectionOptions {
  port?: NumericLike;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  [key: string]: unknown;
}

export interface SqlServerConnectionConfig extends DatabaseConnectionConfig {
  server?: string;
  options?: SqlServerConnectionOptions;
}

export interface HanaConnectionConfig extends DatabaseConnectionConfig {
  [key: string]: unknown;
}

export type GenericConnectionConfig =
  | DatabaseConnectionConfig
  | SqlServerConnectionConfig
  | HanaConnectionConfig;

export interface SavedConnectionInput extends DatabaseConnectionConfig {
  name: string;
  database: SupportedDatabase;
  version: string;
  defaultDatabase?: string;
  defaultSchema?: string;
}

export interface SavedConnection extends SavedConnectionInput {
  id: number;
}

export interface SavedQueryDbSchema {
  database: string;
  schema: string;
  sgbd?: string;
  version?: string;
  name?: string;
  host?: string;
  port?: NumericLike;
  connId?: number;
}

export interface SavedQueryInput {
  name: string;
  type: string;
  sql: string;
  dbSchema?: SavedQueryDbSchema;
}

export interface SavedQuery extends SavedQueryInput {
  id: number;
}

export interface DatabaseVersionInfo {
  name: string;
  service: string;
  date: string;
}

export interface AvailableConnectionDefinition {
  id: number;
  database: SupportedDatabase;
  versions: DatabaseVersionInfo[];
  active: boolean;
}

export interface DatabaseSchemaEntry {
  database: string;
  schemas: string[];
}

export type DatabaseObjectType =
  | 'table'
  | 'view'
  | 'procedure'
  | 'function'
  | 'index';

export interface NamedDatabaseObject {
  id?: string;
  name: string;
  type: Exclude<DatabaseObjectType, 'index'>;
}

export interface IndexedDatabaseObject {
  id?: string;
  name: string;
  table: string;
  type: 'index';
  index_type?: string;
}

export type DatabaseObject = NamedDatabaseObject | IndexedDatabaseObject;

export interface GroupedDatabaseObjects {
  tables: DatabaseObject[];
  views: DatabaseObject[];
  procedures: DatabaseObject[];
  indexes: DatabaseObject[];
}

export interface TableColumn {
  name: string;
  type: string;
}

export interface SelectedSchemaInfo {
  database: string;
  schema: string;
}

export interface QueryExecutionPayload {
  result?: QueryRows;
  columns?: string[];
  totalRows?: number | null;
  database?: string;
}

export interface SchemaChangePayload {
  currentSchema?: SelectedSchemaInfo;
  currentDatabase?: SelectedSchemaInfo;
}

export interface ServiceSuccess {
  success: true;
  message?: string;
}

export interface ServiceFailure {
  success: false;
  message: string;
  error?: string;
  code?: string | number | null;
  sql?: string | null;
  sqlState?: string | null;
  errno?: number | null;
}

export type ServiceResult<T extends object = Record<never, never>> =
  | (ServiceSuccess & T)
  | ServiceFailure;

export type ConnectionServiceResult = ServiceResult;
export type QueryExecutionResult = ServiceResult<QueryExecutionPayload>;
export type SavedEntityResult<T> = ServiceResult<{ data: T }>;
export type DatabaseSchemaListResult = ServiceResult<{ data: DatabaseSchemaEntry[] }>;
export type DatabaseObjectsResult = ServiceResult<{ data: DatabaseObject[] } & GroupedDatabaseObjects>;
export type TableColumnsResult = ServiceResult<{ data: TableColumn[] }>;
export type TableMetadataRowsResult = ServiceResult<{ data: QueryRow[] }>;
export type TableDDLResult = ServiceResult<{ ddl: string }>;
export type SelectedSchemaResult = ServiceResult<SelectedSchemaInfo>;
export type SchemaChangeResult = ServiceResult<SchemaChangePayload>;
export type StoredConnectionsResult = SavedConnection[];
export type StoredQueriesResult = SavedQuery[];

export interface QueryRequestBody extends ConnectionContextPayload {
  sql: string;
  maxLines?: number | null;
}

export interface SchemaRequestBody extends ConnectionContextPayload {
  schema?: string;
  database?: string;
}

export interface SqlServerQueryParameter {
  name: string;
  type: (() => ISqlType) | ISqlType;
  value: unknown;
}

export interface HANAStatementRow extends QueryRow {
  [key: string]: QueryRowValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isSavedConnection(value: unknown): value is SavedConnection {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['id'] === 'number' &&
    typeof value['name'] === 'string' &&
    typeof value['database'] === 'string' &&
    typeof value['version'] === 'string' &&
    typeof value['host'] === 'string' &&
    (typeof value['port'] === 'string' || typeof value['port'] === 'number') &&
    typeof value['user'] === 'string' &&
    typeof value['password'] === 'string' &&
    (value['defaultDatabase'] === undefined || typeof value['defaultDatabase'] === 'string') &&
    (value['defaultSchema'] === undefined || typeof value['defaultSchema'] === 'string')
  );
}

export function isSavedQueryDbSchema(value: unknown): value is SavedQueryDbSchema {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value['database'] === 'string' && typeof value['schema'] === 'string';
}

export function isSavedQuery(value: unknown): value is SavedQuery {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['id'] === 'number' &&
    typeof value['name'] === 'string' &&
    typeof value['type'] === 'string' &&
    typeof value['sql'] === 'string' &&
    (value['dbSchema'] === undefined || isSavedQueryDbSchema(value['dbSchema']))
  );
}
