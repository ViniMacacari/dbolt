import { once } from 'node:events';
import { createWriteStream, type WriteStream } from 'node:fs';
import { access, rename, rm } from 'node:fs/promises';
import { dirname, extname, isAbsolute, resolve } from 'node:path';

import HanaV1 from '../../models/hana/hana-v1.js';
import MySQLV1 from '../../models/mysql/mysql5.js';
import PgV1 from '../../models/postgres/v9.js';
import SQLiteV3 from '../../models/sqlite/v3.js';
import SQLServerV1 from '../../models/sqlserver/v2008.js';
import DatabaseInfoHana from '../database-info/hana/hana-v1.js';
import DatabaseInfoMySQL from '../database-info/mysql/mysql5.js';
import DatabaseInfoPostgres from '../database-info/postgres/v9.js';
import DatabaseInfoSQLite from '../database-info/sqlite/v3.js';
import DatabaseInfoSQLServer from '../database-info/sqlserver/v2008.js';
import { normalizeIdentifier, quoteIdentifier, quoteSqlServerIdentifier, quoteSqlString } from '../../utils/sql-identifiers.js';

import type { QueryRow, TableColumn } from '../../types.js';

export type DatabaseExportEngine = 'mysql' | 'postgres' | 'hana' | 'sqlserver' | 'sqlite';
export type DatabaseExportObjectType =
  | 'table'
  | 'view'
  | 'materialized_view'
  | 'procedure'
  | 'function'
  | 'trigger'
  | 'event'
  | 'sequence'
  | 'synonym'
  | 'type'
  | 'domain'
  | 'index';
export type DatabaseExportRisk = 'low' | 'medium' | 'high' | 'extreme';

export interface DatabaseExportContext {
  sgbd: string;
  version?: string;
  database?: string;
  schema?: string;
  connectionKey: string;
}

export interface DatabaseExportObjectSelection {
  name: string;
  type: DatabaseExportObjectType;
  table?: string;
}

export interface DatabaseExportEstimateRequest {
  context: DatabaseExportContext;
  objects: DatabaseExportObjectSelection[];
  includeData: boolean;
}

export interface DatabaseExportRunRequest extends DatabaseExportEstimateRequest {
  outputPath: string;
  includeStructure: boolean;
  addDropStatements?: boolean;
  acknowledgedLargeExport?: boolean;
  batchSize?: number;
}

export interface DatabaseExportTableEstimate {
  name: string;
  estimatedRows: number | null;
  estimatedBytes: number | null;
}

export interface DatabaseExportEstimate {
  risk: DatabaseExportRisk;
  acknowledgementRequired: boolean;
  estimatedRows: number;
  estimatedBytes: number;
  unknownTableCount: number;
  selectedObjectCount: number;
  selectedTableCount: number;
  tables: DatabaseExportTableEstimate[];
  warnings: string[];
}

export interface DatabaseExportProgress {
  stage: 'preparing' | 'structure' | 'data' | 'finalizing';
  completedObjects: number;
  totalObjects: number;
  currentObject?: string;
  rowsWritten: number;
  estimatedRows: number;
  bytesWritten: number;
}

export interface DatabaseExportResult {
  filePath: string;
  rowsWritten: number;
  objectsWritten: number;
  bytesWritten: number;
  completedAt: string;
}

type DatabaseModel = {
  executeQuery: (sql: string, params?: any, connectionKey?: string) => Promise<any>;
  disconnect: (connectionKey?: string) => Promise<void>;
};

type DatabaseInfoProvider = {
  tableDDL: (name: string, connectionKey?: string) => Promise<{ success: boolean; ddl?: string; message?: string; error?: string }>;
  procedureDDL: (name: string, connectionKey?: string) => Promise<{ success: boolean; ddl?: string; message?: string; error?: string }>;
  objectDDL: (object: DatabaseExportObjectSelection, connectionKey?: string) => Promise<{ success: boolean; ddl?: string; message?: string; error?: string }>;
  tableColumns: (name: string, connectionKey?: string, schema?: string) => Promise<{ success: boolean; data?: TableColumn[]; message?: string; error?: string }>;
  tableKeys: (name: string, connectionKey?: string) => Promise<{ success: boolean; data?: QueryRow[]; message?: string; error?: string }>;
  tableIndexes: (name: string, connectionKey?: string) => Promise<{ success: boolean; data?: QueryRow[]; message?: string; error?: string }>;
};

type DatabaseExportReporter = (progress: DatabaseExportProgress) => void;

const MEDIUM_ROW_THRESHOLD = 1_000_000;
const HIGH_ROW_THRESHOLD = 5_000_000;
const EXTREME_ROW_THRESHOLD = 50_000_000;
const GIB = 1024 ** 3;
const MAX_SELECTED_OBJECTS = 10_000;
const DEFAULT_BATCH_SIZE = 250;
const MAX_BATCH_SIZE = 1_000;

export class DatabaseExportCancelledError extends Error {
  constructor() {
    super('Database export was cancelled.');
    this.name = 'DatabaseExportCancelledError';
  }
}

export class DatabaseExportService {
  private readonly models: Record<DatabaseExportEngine, DatabaseModel> = {
    mysql: new MySQLV1(),
    postgres: new PgV1(),
    hana: new HanaV1(),
    sqlserver: new SQLServerV1(),
    sqlite: new SQLiteV3()
  };

  private readonly providers: Record<DatabaseExportEngine, DatabaseInfoProvider> = {
    mysql: DatabaseInfoMySQL,
    postgres: DatabaseInfoPostgres,
    hana: DatabaseInfoHana,
    sqlserver: DatabaseInfoSQLServer,
    sqlite: DatabaseInfoSQLite
  };

  async estimate(request: DatabaseExportEstimateRequest): Promise<DatabaseExportEstimate> {
    const context = this.normalizeContext(request.context);
    const objects = this.normalizeObjects(request.objects);
    const tableNames = objects
      .filter((object) => object.type === 'table')
      .map((object) => object.name);
    const estimates = request.includeData
      ? await this.loadTableEstimates(context, tableNames)
      : tableNames.map((name) => ({ name, estimatedRows: 0, estimatedBytes: 0 }));

    return this.buildEstimate(objects, estimates, Boolean(request.includeData));
  }

  async disconnect(rawContext: DatabaseExportContext): Promise<void> {
    const context = this.normalizeContext(rawContext);
    await this.models[context.sgbd].disconnect(context.connectionKey);
  }

  async exportToFile(
    request: DatabaseExportRunRequest,
    reportProgress: DatabaseExportReporter,
    isCancelled: () => boolean = () => false
  ): Promise<DatabaseExportResult> {
    const context = this.normalizeContext(request.context);
    const objects = this.normalizeObjects(request.objects);
    const includeStructure = Boolean(request.includeStructure);
    const includeData = Boolean(request.includeData);

    if (!includeStructure && !includeData) {
      throw new Error('Select structure, data, or both before exporting.');
    }

    if (objects.length === 0) {
      throw new Error('Select at least one database object before exporting.');
    }

    if (includeData && !objects.some((object) => object.type === 'table') && !includeStructure) {
      throw new Error('Select at least one table when exporting data only.');
    }

    const outputPath = await this.validateOutputPath(request.outputPath);
    const estimate = await this.estimate({ context, objects, includeData });
    if (estimate.acknowledgementRequired && !request.acknowledgedLargeExport) {
      throw new Error('The large export warning must be acknowledged before continuing.');
    }

    const batchSize = this.normalizeBatchSize(request.batchSize);
    const selectedTables = objects.filter((object) => object.type === 'table');
    const structureObjects = includeStructure ? objects : [];
    const dataObjects = includeData ? selectedTables : [];
    const tableExtras = includeStructure && context.sgbd !== 'mysql' ? selectedTables : [];
    const totalObjects = structureObjects.length + dataObjects.length + tableExtras.length;
    const temporaryPath = `${outputPath}.dbolt-${Date.now()}.part`;
    const writer = createWriteStream(temporaryPath, { encoding: 'utf8', flags: 'wx' });
    let completedObjects = 0;
    let rowsWritten = 0;
    let objectsWritten = 0;

    const progress = (stage: DatabaseExportProgress['stage'], currentObject?: string): void => {
      reportProgress({
        stage,
        completedObjects,
        totalObjects,
        currentObject,
        rowsWritten,
        estimatedRows: estimate.estimatedRows,
        bytesWritten: writer.bytesWritten
      });
    };

    try {
      progress('preparing');
      await this.writeHeader(writer, context, estimate, includeStructure, includeData);
      await this.writeSessionPreamble(writer, context.sgbd as DatabaseExportEngine);

      if (includeStructure) {
        for (const object of this.sortStructureObjects(structureObjects)) {
          this.throwIfCancelled(isCancelled);
          progress('structure', object.name);
          const statements = await this.loadStructureStatements(
            context,
            object,
            Boolean(request.addDropStatements),
            objects
          );

          for (const statement of statements) {
            await this.write(writer, `${statement.trim()}\n\n`);
          }

          completedObjects += 1;
          objectsWritten += 1;
          progress('structure', object.name);
        }
      }

      if (includeData) {
        for (const table of dataObjects) {
          this.throwIfCancelled(isCancelled);
          progress('data', table.name);
          const exportedRows = await this.writeTableData(
            writer,
            context,
            table.name,
            batchSize,
            (batchRows) => {
              rowsWritten += batchRows;
              progress('data', table.name);
            },
            isCancelled
          );

          await this.write(writer, exportedRows > 0 ? '\n' : `-- No rows exported from ${table.name}.\n\n`);
          completedObjects += 1;
          objectsWritten += 1;
          progress('data', table.name);
        }
      }

      if (includeStructure) {
        for (const table of tableExtras) {
          this.throwIfCancelled(isCancelled);
          progress('structure', table.name);
          const statements = await this.loadTableConstraintAndIndexStatements(
            context,
            table.name
          );

          for (const statement of statements) {
            await this.write(writer, `${statement.trim()}\n\n`);
          }

          completedObjects += 1;
          progress('structure', table.name);
        }
      }

      progress('finalizing');
      await this.writeSessionEpilogue(writer, context.sgbd as DatabaseExportEngine);
      await this.endWriter(writer);
      this.throwIfCancelled(isCancelled);
      await this.replaceOutputFile(temporaryPath, outputPath);

      return {
        filePath: outputPath,
        rowsWritten,
        objectsWritten,
        bytesWritten: writer.bytesWritten,
        completedAt: new Date().toISOString()
      };
    } catch (error: unknown) {
      if (!writer.closed) {
        writer.destroy();
        await once(writer, 'close').catch(() => undefined);
      }
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  buildEstimate(
    objects: DatabaseExportObjectSelection[],
    tables: DatabaseExportTableEstimate[],
    includeData: boolean
  ): DatabaseExportEstimate {
    const estimatedRows = tables.reduce((total, table) => total + (table.estimatedRows || 0), 0);
    const estimatedBytes = tables.reduce((total, table) => total + (table.estimatedBytes || 0), 0);
    const unknownTableCount = includeData
      ? tables.filter((table) => table.estimatedRows === null || table.estimatedBytes === null).length
      : 0;
    const risk = this.getRisk(estimatedRows, estimatedBytes, unknownTableCount, includeData);
    const warnings: string[] = [];

    if (includeData && unknownTableCount > 0) warnings.push('unknown-size');
    if (risk === 'medium') warnings.push('large');
    if (risk === 'high') warnings.push('very-large');
    if (risk === 'extreme') warnings.push('extreme');
    if (includeData && risk !== 'low') warnings.push('database-load');
    if (includeData && (risk === 'high' || risk === 'extreme')) warnings.push('hours-or-days');

    return {
      risk,
      acknowledgementRequired: includeData && (risk !== 'low' || unknownTableCount > 0),
      estimatedRows,
      estimatedBytes,
      unknownTableCount,
      selectedObjectCount: objects.length,
      selectedTableCount: objects.filter((object) => object.type === 'table').length,
      tables,
      warnings
    };
  }

  private normalizeContext(context: DatabaseExportContext): DatabaseExportContext & { sgbd: DatabaseExportEngine } {
    if (!context?.connectionKey || !String(context.connectionKey).startsWith('db-export-')) {
      throw new Error('A dedicated database export connection is required.');
    }

    const normalizedEngine = String(context.sgbd || '').trim().toLowerCase();
    const engine = normalizedEngine === 'postgresql' ? 'postgres' : normalizedEngine === 'mssql' ? 'sqlserver' : normalizedEngine;
    if (!['mysql', 'postgres', 'hana', 'sqlserver', 'sqlite'].includes(engine)) {
      throw new Error(`Unsupported database engine: ${context.sgbd || 'unknown'}`);
    }

    return {
      ...context,
      sgbd: engine as DatabaseExportEngine,
      database: context.database ? normalizeIdentifier(context.database, 'Database name') : undefined,
      schema: context.schema ? normalizeIdentifier(context.schema, 'Schema name') : undefined,
      connectionKey: String(context.connectionKey)
    };
  }

  private normalizeObjects(objects: DatabaseExportObjectSelection[] = []): DatabaseExportObjectSelection[] {
    if (!Array.isArray(objects) || objects.length > MAX_SELECTED_OBJECTS) {
      throw new Error(`Select no more than ${MAX_SELECTED_OBJECTS} database objects per export.`);
    }

    const validTypes = new Set<DatabaseExportObjectType>([
      'table', 'view', 'materialized_view', 'procedure', 'function', 'trigger',
      'event', 'sequence', 'synonym', 'type', 'domain', 'index'
    ]);
    const unique = new Map<string, DatabaseExportObjectSelection>();

    for (const object of objects) {
      if (!object || !validTypes.has(object.type)) continue;
      const normalized = {
        name: normalizeIdentifier(object.name, 'Object name'),
        type: object.type,
        table: object.table ? normalizeIdentifier(object.table, 'Parent table name') : undefined
      };
      unique.set(`${normalized.type}:${normalized.table || ''}:${normalized.name}`, normalized);
    }

    return [...unique.values()];
  }

  private async loadTableEstimates(
    context: DatabaseExportContext & { sgbd: DatabaseExportEngine },
    tableNames: string[]
  ): Promise<DatabaseExportTableEstimate[]> {
    if (tableNames.length === 0) return [];
    if (context.sgbd === 'sqlite') {
      return tableNames.map((name) => ({ name, estimatedRows: null, estimatedBytes: null }));
    }

    const estimates = new Map<string, DatabaseExportTableEstimate>();
    try {
      for (let offset = 0; offset < tableNames.length; offset += 250) {
        const chunk = tableNames.slice(offset, offset + 250);
        const rows = await this.models[context.sgbd].executeQuery(
          this.buildEstimateQuery(context, chunk),
          [],
          context.connectionKey
        );

        for (const row of rows) {
          const name = String(row['name'] || row['NAME'] || '');
          if (!name) continue;
          estimates.set(name, {
            name,
            estimatedRows: this.toNonNegativeNumber(row['estimated_rows'] ?? row['ESTIMATED_ROWS']),
            estimatedBytes: this.toNonNegativeNumber(row['estimated_bytes'] ?? row['ESTIMATED_BYTES'])
          });
        }
      }
    } catch (error: unknown) {
      console.warn('Could not estimate database export size from catalog metadata.', error);
    }

    return tableNames.map((name) => estimates.get(name) || {
      name,
      estimatedRows: null,
      estimatedBytes: null
    });
  }

  private buildEstimateQuery(
    context: DatabaseExportContext & { sgbd: DatabaseExportEngine },
    tableNames: string[]
  ): string {
    const names = tableNames.map((name) => this.quoteCatalogString(context.sgbd, name)).join(', ');
    const schema = this.quoteCatalogString(context.sgbd, context.schema || this.defaultSchema(context.sgbd));

    if (context.sgbd === 'mysql') {
      const database = context.database ? this.quoteCatalogString(context.sgbd, context.database) : 'DATABASE()';
      return `
        SELECT TABLE_NAME AS name,
               COALESCE(TABLE_ROWS, 0) AS estimated_rows,
               COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0) AS estimated_bytes
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ${database}
          AND TABLE_TYPE = 'BASE TABLE'
          AND TABLE_NAME IN (${names})
      `;
    }

    if (context.sgbd === 'postgres') {
      return `
        SELECT c.relname AS name,
               GREATEST(c.reltuples, 0)::bigint AS estimated_rows,
               pg_total_relation_size(c.oid)::bigint AS estimated_bytes
        FROM pg_class c
        INNER JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ${schema}
          AND c.relkind IN ('r', 'p')
          AND c.relname IN (${names})
      `;
    }

    if (context.sgbd === 'hana') {
      return `
        SELECT TABLE_NAME AS "name",
               RECORD_COUNT AS "estimated_rows",
               TABLE_SIZE AS "estimated_bytes"
        FROM SYS.M_TABLES
        WHERE SCHEMA_NAME = ${schema}
          AND TABLE_NAME IN (${names})
      `;
    }

    return `
      SELECT o.name AS name,
             SUM(CASE WHEN p.index_id IN (0, 1) THEN p.row_count ELSE 0 END) AS estimated_rows,
             SUM(p.reserved_page_count) * 8192 AS estimated_bytes
      FROM sys.dm_db_partition_stats p
      INNER JOIN sys.objects o ON o.object_id = p.object_id
      INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
      WHERE s.name = ${schema}
        AND o.type = 'U'
        AND o.name IN (${names})
      GROUP BY o.name
    `;
  }

  private getRisk(rows: number, bytes: number, unknownTables: number, includeData: boolean): DatabaseExportRisk {
    if (!includeData) return 'low';
    if (rows >= EXTREME_ROW_THRESHOLD || bytes >= 50 * GIB) return 'extreme';
    if (rows >= HIGH_ROW_THRESHOLD || bytes >= 5 * GIB) return 'high';
    if (rows >= MEDIUM_ROW_THRESHOLD || bytes >= GIB || unknownTables > 0) return 'medium';
    return 'low';
  }

  private async validateOutputPath(value: string): Promise<string> {
    const rawPath = String(value || '').trim();
    if (!rawPath || !isAbsolute(rawPath) || extname(rawPath).toLowerCase() !== '.sql') {
      throw new Error('Choose an absolute output path ending in .sql.');
    }

    const outputPath = resolve(rawPath);
    await access(dirname(outputPath));
    return outputPath;
  }

  private sortStructureObjects(objects: DatabaseExportObjectSelection[]): DatabaseExportObjectSelection[] {
    const priority: Record<DatabaseExportObjectType, number> = {
      type: 0,
      domain: 0,
      sequence: 1,
      table: 2,
      index: 3,
      materialized_view: 4,
      view: 5,
      procedure: 6,
      function: 6,
      synonym: 7,
      trigger: 8,
      event: 8
    };

    return [...objects].sort((left, right) =>
      priority[left.type] - priority[right.type] || left.name.localeCompare(right.name)
    );
  }

  private async loadStructureStatements(
    context: DatabaseExportContext & { sgbd: DatabaseExportEngine },
    object: DatabaseExportObjectSelection,
    addDropStatements: boolean,
    allSelectedObjects: DatabaseExportObjectSelection[]
  ): Promise<string[]> {
    const provider = this.providers[context.sgbd];
    const statements: string[] = [];

    if (object.type === 'index') {
      const parentTableSelected = allSelectedObjects.some((selected) =>
        selected.type === 'table' && selected.name === object.table
      );
      if (parentTableSelected) return [];
    }

    if (addDropStatements) statements.push(this.buildDropStatement(context, object));

    if (object.type === 'table' || object.type === 'view' || object.type === 'materialized_view') {
      const result = await provider.tableDDL(object.name, context.connectionKey);
      this.assertProviderResult(result, `Could not load DDL for ${object.name}.`);
      if (result.ddl?.trim()) statements.push(this.terminateStatement(result.ddl));

      return statements;
    }

    if (object.type === 'index') {
      statements.push(...await this.loadSelectedIndexStatements(context, object));
      return statements;
    }

    const result = await provider.objectDDL(object, context.connectionKey);
    this.assertProviderResult(result, `Could not load ${object.type} DDL for ${object.name}.`);
    if (result.ddl?.trim()) {
      const delimiterObject = context.sgbd === 'mysql' &&
        ['procedure', 'function', 'trigger', 'event'].includes(object.type);
      statements.push(delimiterObject
        ? this.formatRoutineStatement(context.sgbd, result.ddl)
        : this.terminateStatement(result.ddl));
    }
    return statements;
  }

  private async loadTableConstraintAndIndexStatements(
    context: DatabaseExportContext & { sgbd: DatabaseExportEngine },
    tableName: string
  ): Promise<string[]> {
    if (context.sgbd === 'mysql') return [];

    const provider = this.providers[context.sgbd];
    const statements: string[] = [];
    const constraintNames = new Set<string>();

    if (context.sgbd !== 'sqlite') {
      const keys = await provider.tableKeys(tableName, context.connectionKey);
      if (keys.success) {
        for (const row of keys.data || []) {
          const name = String(row['name'] || '');
          if (name) constraintNames.add(name);
        }
        statements.push(...this.buildKeyStatements(context, tableName, keys.data || []));
      }
    }

    const indexes = await provider.tableIndexes(tableName, context.connectionKey);
    if (indexes.success) {
      statements.push(...await this.buildIndexStatements(context, tableName, indexes.data || [], constraintNames));
    }

    return statements;
  }

  private async loadSelectedIndexStatements(
    context: DatabaseExportContext & { sgbd: DatabaseExportEngine },
    object: DatabaseExportObjectSelection
  ): Promise<string[]> {
    if (!object.table) return [];
    const result = await this.providers[context.sgbd].tableIndexes(object.table, context.connectionKey);
    this.assertProviderResult(result, `Could not load index ${object.name}.`);
    const rows = (result.data || []).filter((row) => String(row['name'] || '') === object.name);
    return this.buildIndexStatements(context, object.table, rows);
  }

  private buildKeyStatements(
    context: DatabaseExportContext & { sgbd: DatabaseExportEngine },
    tableName: string,
    rows: QueryRow[]
  ): string[] {
    const grouped = this.groupMetadataRows(rows);
    const table = this.qualifyTable(context, tableName);
    const statements: string[] = [];

    for (const [name, group] of grouped) {
      const type = String(group[0]?.['type'] || '').toUpperCase();
      const columns = group
        .map((row) => String(row['column_name'] || ''))
        .filter(Boolean)
        .map((column) => this.quoteIdentifierForEngine(context.sgbd, column));
      if (columns.length === 0) continue;

      const constraintName = this.quoteIdentifierForEngine(context.sgbd, name);
      if (type.includes('PRIMARY')) {
        statements.push(`ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} PRIMARY KEY (${columns.join(', ')});`);
      } else if (type.includes('UNIQUE')) {
        statements.push(`ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} UNIQUE (${columns.join(', ')});`);
      } else if (type.includes('FOREIGN')) {
        const referencedTable = String(group[0]?.['referenced_table'] || '');
        const referencedColumns = group
          .map((row) => String(row['referenced_column'] || ''))
          .filter(Boolean)
          .map((column) => this.quoteIdentifierForEngine(context.sgbd, column));
        if (referencedTable && referencedColumns.length === columns.length) {
          statements.push(
            `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${columns.join(', ')}) ` +
            `REFERENCES ${this.qualifyTable(context, referencedTable)} (${referencedColumns.join(', ')});`
          );
        }
      }
    }

    return statements;
  }

  private async buildIndexStatements(
    context: DatabaseExportContext & { sgbd: DatabaseExportEngine },
    tableName: string,
    rows: QueryRow[],
    excludedNames: ReadonlySet<string> = new Set<string>()
  ): Promise<string[]> {
    if (context.sgbd === 'postgres') {
      return rows
        .filter((row) => !excludedNames.has(String(row['name'] || '')))
        .map((row) => String(row['ddl'] || '').trim())
        .filter(Boolean)
        .map((ddl) => this.terminateStatement(ddl));
    }

    if (context.sgbd === 'sqlite') {
      const names = [...new Set(rows.map((row) => String(row['name'] || '')).filter(Boolean))];
      const statements: string[] = [];
      for (const name of names) {
        const ddlRows = await this.models.sqlite.executeQuery(
          `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ${quoteSqlString(name)} LIMIT 1`,
          [],
          context.connectionKey
        );
        const ddl = String(ddlRows[0]?.['sql'] || '').trim();
        if (ddl) statements.push(this.terminateStatement(ddl));
      }
      return statements;
    }

    const statements: string[] = [];
    for (const [name, group] of this.groupMetadataRows(rows)) {
      if (!name || excludedNames.has(name) || name.toUpperCase() === 'PRIMARY') continue;
      const primary = this.toBoolean(group[0]?.['is_primary_key']);
      if (primary) continue;
      const columns = group
        .map((row) => String(row['column_name'] || ''))
        .filter(Boolean)
        .map((column) => this.quoteIdentifierForEngine(context.sgbd, column));
      if (columns.length === 0) continue;

      const unique = this.toBoolean(group[0]?.['is_unique']) || Number(group[0]?.['non_unique']) === 0;
      const indexType = String(group[0]?.['index_type'] || '').toUpperCase();
      const clustered = context.sgbd === 'sqlserver' && indexType.includes('CLUSTERED') ? ' CLUSTERED' : '';
      const prefix = unique ? 'CREATE UNIQUE' : 'CREATE';
      statements.push(
        `${prefix}${clustered} INDEX ${this.quoteIdentifierForEngine(context.sgbd, name)} ` +
        `ON ${this.qualifyTable(context, tableName)} (${columns.join(', ')});`
      );
    }
    return statements;
  }

  private async writeTableData(
    writer: WriteStream,
    context: DatabaseExportContext & { sgbd: DatabaseExportEngine },
    tableName: string,
    batchSize: number,
    onBatch: (rows: number) => void,
    isCancelled: () => boolean
  ): Promise<number> {
    const columnsResult = await this.providers[context.sgbd].tableColumns(
      tableName,
      context.connectionKey,
      context.schema
    );
    this.assertProviderResult(columnsResult, `Could not load columns for ${tableName}.`);
    const columns = (columnsResult.data || []).filter((column) => this.isInsertableColumn(context.sgbd, column));
    if (columns.length === 0) return 0;

    const columnNames = columns.map((column) => column.name);
    const quotedColumns = columnNames.map((column) => this.quoteIdentifierForEngine(context.sgbd, column));
    const table = this.qualifyTable(context, tableName);
    const hasIdentityColumn = context.sgbd === 'sqlserver' && columns.some((column) =>
      this.toBoolean(column['is_identity'])
    );
    const primaryKeyColumns = await this.loadPrimaryKeyColumns(context, tableName);
    let offset = 0;
    let exportedRows = 0;

    await this.write(writer, `-- Data for ${table}\n`);
    if (hasIdentityColumn) await this.write(writer, `SET IDENTITY_INSERT ${table} ON;\n`);

    while (true) {
      this.throwIfCancelled(isCancelled);
      const rows = await this.models[context.sgbd].executeQuery(
        this.buildPageQuery(context.sgbd, table, quotedColumns, primaryKeyColumns, offset, batchSize),
        [],
        context.connectionKey
      );
      if (rows.length === 0) break;

      for (const row of rows) {
        this.throwIfCancelled(isCancelled);
        const values = columnNames.map((column) => this.toSqlLiteral(context.sgbd, row[column]));
        await this.write(
          writer,
          `INSERT INTO ${table} (${quotedColumns.join(', ')}) VALUES (${values.join(', ')});\n`
        );
      }

      exportedRows += rows.length;
      offset += rows.length;
      onBatch(rows.length);
      if (rows.length < batchSize) break;
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 5));
    }

    if (hasIdentityColumn) await this.write(writer, `SET IDENTITY_INSERT ${table} OFF;\n`);

    return exportedRows;
  }

  private async loadPrimaryKeyColumns(
    context: DatabaseExportContext & { sgbd: DatabaseExportEngine },
    tableName: string
  ): Promise<string[]> {
    const result = await this.providers[context.sgbd].tableKeys(tableName, context.connectionKey);
    if (!result.success) return [];

    return (result.data || [])
      .filter((row) => String(row['type'] || '').toUpperCase().includes('PRIMARY'))
      .sort((left, right) => Number(left['ordinal_position'] || 0) - Number(right['ordinal_position'] || 0))
      .map((row) => String(row['column_name'] || ''))
      .filter(Boolean)
      .map((column) => this.quoteIdentifierForEngine(context.sgbd, column));
  }

  private buildPageQuery(
    engine: DatabaseExportEngine,
    table: string,
    columns: string[],
    primaryKeyColumns: string[],
    offset: number,
    batchSize: number
  ): string {
    const orderBy = primaryKeyColumns.length > 0 ? primaryKeyColumns.join(', ') : '';

    if (engine !== 'sqlserver') {
      const ordering = orderBy ? ` ORDER BY ${orderBy}` : '';
      return `SELECT ${columns.join(', ')} FROM ${table}${ordering} LIMIT ${batchSize} OFFSET ${offset}`;
    }

    const sourceAlias = quoteSqlServerIdentifier('__dbolt_export_source');
    const rowNumberAlias = quoteSqlServerIdentifier('__dbolt_export_row_number');
    const outerColumns = columns.map((column) => `${sourceAlias}.${column}`).join(', ');
    const sqlServerOrder = orderBy || '(SELECT NULL)';
    return `SELECT ${outerColumns} FROM (` +
      `SELECT ${columns.join(', ')}, ROW_NUMBER() OVER (ORDER BY ${sqlServerOrder}) AS ${rowNumberAlias} ` +
      `FROM ${table}) AS ${sourceAlias} ` +
      `WHERE ${sourceAlias}.${rowNumberAlias} > ${offset} ` +
      `AND ${sourceAlias}.${rowNumberAlias} <= ${offset + batchSize} ` +
      `ORDER BY ${sourceAlias}.${rowNumberAlias}`;
  }

  private isInsertableColumn(engine: DatabaseExportEngine, column: TableColumn): boolean {
    if (engine === 'mysql' && /generated/i.test(String(column['extra'] || ''))) return false;
    if (engine === 'sqlserver' && this.toBoolean(column['is_computed'])) return false;
    if (engine === 'sqlite' && Number(column['hidden'] || 0) > 0) return false;
    return Boolean(column.name);
  }

  private toSqlLiteral(engine: DatabaseExportEngine, value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'boolean') return engine === 'postgres' ? (value ? 'TRUE' : 'FALSE') : (value ? '1' : '0');
    if (value instanceof Date) return quoteSqlString(value.toISOString());
    if (Buffer.isBuffer(value)) {
      const hex = value.toString('hex');
      if (engine === 'postgres') return `decode('${hex}', 'hex')`;
      if (engine === 'sqlserver') return `0x${hex}`;
      return `X'${hex}'`;
    }

    let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (engine === 'mysql') {
      text = text
        .replaceAll('\\', '\\\\')
        .replaceAll('\0', '\\0')
        .replaceAll('\u001a', '\\Z');
    }
    const quoted = quoteSqlString(text);
    return engine === 'sqlserver' ? `N${quoted}` : quoted;
  }

  private buildDropStatement(
    context: DatabaseExportContext & { sgbd: DatabaseExportEngine },
    object: DatabaseExportObjectSelection
  ): string {
    if (object.type === 'index') {
      const index = this.quoteIdentifierForEngine(context.sgbd, object.name);
      if (context.sgbd === 'mysql' && object.table) {
        return `DROP INDEX ${index} ON ${this.qualifyTable(context, object.table)};`;
      }
      if (context.sgbd === 'sqlserver' && object.table) {
        return `DROP INDEX ${index} ON ${this.qualifyTable(context, object.table)};`;
      }
      const qualifiedIndex = context.schema
        ? `${this.quoteIdentifierForEngine(context.sgbd, context.schema)}.${index}`
        : index;
      if (context.sgbd === 'hana') return `DROP INDEX ${qualifiedIndex};`;
      return `DROP INDEX IF EXISTS ${qualifiedIndex};`;
    }

    const qualified = this.qualifyTable(context, object.name);
    if (context.sgbd === 'sqlserver') {
      const dropType = this.dropType(object.type);
      if (object.type === 'type') {
        return `IF TYPE_ID(N'${qualified.replaceAll("'", "''")}') IS NOT NULL DROP TYPE ${qualified};`;
      }
      return `IF OBJECT_ID(N'${qualified.replaceAll("'", "''")}') IS NOT NULL DROP ${dropType} ${qualified};`;
    }

    const dropType = this.dropType(object.type);
    if (context.sgbd === 'postgres' && (object.type === 'function' || object.type === 'procedure')) {
      return '-- PostgreSQL routine DDL uses CREATE OR REPLACE; overload signatures are preserved.';
    }
    if (context.sgbd === 'hana') return `DROP ${dropType} ${qualified};`;
    return `DROP ${dropType} IF EXISTS ${qualified};`;
  }

  private dropType(type: DatabaseExportObjectType): string {
    if (type === 'materialized_view') return 'MATERIALIZED VIEW';
    return type.toUpperCase();
  }

  private formatRoutineStatement(engine: DatabaseExportEngine, ddl: string): string {
    const trimmed = ddl.trim().replace(/;$/, '');
    if (engine === 'mysql') return `DELIMITER $$\n${trimmed}$$\nDELIMITER ;`;
    return `${trimmed};`;
  }

  private terminateStatement(statement: string): string {
    const trimmed = statement.trim();
    return trimmed.endsWith(';') ? trimmed : `${trimmed};`;
  }

  private async writeHeader(
    writer: WriteStream,
    context: DatabaseExportContext,
    estimate: DatabaseExportEstimate,
    includeStructure: boolean,
    includeData: boolean
  ): Promise<void> {
    await this.write(writer, [
      '-- DBolt database export',
      `-- Generated: ${new Date().toISOString()}`,
      `-- Engine: ${context.sgbd}`,
      `-- Database: ${context.database || '-'}`,
      `-- Schema: ${context.schema || '-'}`,
      `-- Structure: ${includeStructure ? 'yes' : 'no'}`,
      `-- Data: ${includeData ? 'yes' : 'no'}`,
      `-- Estimated rows: ${estimate.estimatedRows}`,
      '-- Data is read in sequential pages. Changes made while the export runs may affect consistency.',
      '',
      ''
    ].join('\n'));
  }

  private async writeSessionPreamble(writer: WriteStream, engine: DatabaseExportEngine): Promise<void> {
    if (engine === 'mysql') await this.write(writer, 'SET FOREIGN_KEY_CHECKS=0;\n\n');
    if (engine === 'sqlite') await this.write(writer, 'PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n\n');
  }

  private async writeSessionEpilogue(writer: WriteStream, engine: DatabaseExportEngine): Promise<void> {
    if (engine === 'mysql') await this.write(writer, '\nSET FOREIGN_KEY_CHECKS=1;\n');
    if (engine === 'sqlite') await this.write(writer, '\nCOMMIT;\nPRAGMA foreign_keys=ON;\n');
  }

  private qualifyTable(context: DatabaseExportContext & { sgbd: DatabaseExportEngine }, tableName: string): string {
    const table = this.quoteIdentifierForEngine(context.sgbd, tableName);
    const namespace = context.sgbd === 'mysql' ? context.database : context.schema;
    return namespace ? `${this.quoteIdentifierForEngine(context.sgbd, namespace)}.${table}` : table;
  }

  private quoteIdentifierForEngine(engine: DatabaseExportEngine, identifier: string): string {
    if (engine === 'mysql') return quoteIdentifier(identifier, '`');
    if (engine === 'sqlserver') return quoteSqlServerIdentifier(identifier);
    return quoteIdentifier(identifier, '"');
  }

  private quoteCatalogString(engine: DatabaseExportEngine, value: string): string {
    const escaped = engine === 'mysql' ? value.replaceAll('\\', '\\\\') : value;
    return quoteSqlString(escaped);
  }

  private defaultSchema(engine: DatabaseExportEngine): string {
    if (engine === 'postgres') return 'public';
    if (engine === 'sqlserver') return 'dbo';
    if (engine === 'sqlite') return 'main';
    return '';
  }

  private groupMetadataRows(rows: QueryRow[]): Map<string, QueryRow[]> {
    const grouped = new Map<string, QueryRow[]>();
    for (const row of rows) {
      const name = String(row['name'] || '');
      if (!name) continue;
      grouped.set(name, [...(grouped.get(name) || []), row]);
    }
    return grouped;
  }

  private assertProviderResult(
    result: { success: boolean; message?: string; error?: string },
    fallback: string
  ): void {
    if (result.success) return;
    throw new Error(result.error || result.message || fallback);
  }

  private normalizeBatchSize(value: unknown): number {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return DEFAULT_BATCH_SIZE;
    return Math.min(Math.max(Math.floor(numberValue), 50), MAX_BATCH_SIZE);
  }

  private toNonNegativeNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(Math.floor(numeric), Number.MAX_SAFE_INTEGER));
  }

  private toBoolean(value: unknown): boolean {
    return value === true || value === 1 || String(value).toLowerCase() === 'true';
  }

  private throwIfCancelled(isCancelled: () => boolean): void {
    if (isCancelled()) throw new DatabaseExportCancelledError();
  }

  private async write(writer: WriteStream, content: string): Promise<void> {
    if (writer.write(content)) return;
    await once(writer, 'drain');
  }

  private async endWriter(writer: WriteStream): Promise<void> {
    writer.end();
    await once(writer, 'finish');
  }

  private async replaceOutputFile(temporaryPath: string, outputPath: string): Promise<void> {
    const backupPath = `${outputPath}.dbolt-backup-${Date.now()}`;
    let existingFileMoved = false;

    try {
      await access(outputPath);
      await rename(outputPath, backupPath);
      existingFileMoved = true;
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code !== 'ENOENT') throw error;
    }

    try {
      await rename(temporaryPath, outputPath);
      if (existingFileMoved) await rm(backupPath, { force: true });
    } catch (error: unknown) {
      if (existingFileMoved) {
        await rename(backupPath, outputPath).catch(() => undefined);
      }
      throw error;
    }
  }
}

export default new DatabaseExportService();
