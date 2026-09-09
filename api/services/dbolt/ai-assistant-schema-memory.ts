import type { AiReadonlyDatabaseContext } from './ai-assistant-readonly-database.js';
import type { AiAssistantToolExecutionResult } from './ai-assistant-tools.js';

const ENTRY_TTL_MS = 30 * 60 * 1000;
const MAX_CONNECTIONS = 12;
const MAX_OBJECTS_PER_CONNECTION = 400;
const MAX_TABLES_WITH_COLUMNS = 40;
const MAX_COLUMNS_PER_TABLE = 120;
const MAX_PROMPT_BLOCK_CHARS = 12000;

interface RememberedColumn {
  name: string;
  type: string;
}

interface RememberedTable {
  columns: RememberedColumn[];
  totalColumns: number;
  updatedAt: number;
}

interface ConnectionIdentity {
  connectionName: string;
  sgbd: string;
  version: string;
  database: string;
  schema: string;
}

interface ConnectionMemory {
  identity: ConnectionIdentity;
  tables: string[];
  views: string[];
  columnsByTable: Map<string, RememberedTable>;
  updatedAt: number;
}

class AiAssistantSchemaMemoryService {
  private readonly memory = new Map<string, ConnectionMemory>();

  remember(
    context: AiReadonlyDatabaseContext | undefined,
    result: AiAssistantToolExecutionResult
  ): void {
    if (!context || !result.success || !result.data) {
      return;
    }

    const entry = this.getOrCreateEntry(context);
    if (!entry) {
      return;
    }

    if (result.name === 'getSchemaSummary') {
      this.rememberObjects(entry, this.readNames(result.data['tables']), 'table');
      this.rememberObjects(entry, this.readNames(result.data['views']), 'view');
    }

    if (result.name === 'searchObjects') {
      const matches = Array.isArray(result.data['matches']) ? result.data['matches'] : [];
      this.rememberObjects(entry, this.readNamesByType(matches, 'table'), 'table');
      this.rememberObjects(entry, this.readNamesByType(matches, 'view'), 'view');
    }

    if (result.name === 'getTableColumns') {
      this.rememberColumns(entry, result.data);
    }

    entry.updatedAt = Date.now();
  }

  buildPromptBlock(context: AiReadonlyDatabaseContext | undefined): string {
    if (!context) {
      return '';
    }

    this.prune();
    const entry = this.memory.get(this.buildKey(context));

    if (!entry || this.isExpired(entry)) {
      return '';
    }

    const tablesWithColumns = [...entry.columnsByTable.entries()]
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
      .slice(0, MAX_TABLES_WITH_COLUMNS)
      .sort((left, right) => left[0].localeCompare(right[0]));

    if (!entry.tables.length && !entry.views.length && !tablesWithColumns.length) {
      return '';
    }

    const sections = [
      'DBOLT schema metadata already confirmed for this exact connection, database and schema in earlier messages:',
      this.buildIdentityLine(entry.identity),
      ...(entry.tables.length ? [`Known tables: ${[...entry.tables].sort().join(', ')}`] : []),
      ...(entry.views.length ? [`Known views: ${[...entry.views].sort().join(', ')}`] : []),
      ...(tablesWithColumns.length ? [
        'Confirmed columns:',
        ...tablesWithColumns.map(([tableName, table]) => this.buildTableLine(tableName, table))
      ] : []),
      'These names came from DBOLT read-only metadata and count as explicitly confirmed. You may use them without requesting getTableColumns again.',
      'This metadata is not live data. Any object or column not listed above still has to be confirmed with a database action before you use it, and row values always require runReadonlyQuery.'
    ];

    return this.fitBlock(sections);
  }

  private buildIdentityLine(identity: ConnectionIdentity): string {
    const parts = [
      ['Connection', identity.connectionName],
      ['Database engine/type', identity.sgbd],
      ['Database version', identity.version],
      ['Database', identity.database],
      ['Schema', identity.schema]
    ]
      .filter((part) => part[1].trim().length > 0)
      .map((part) => `${part[0]}: ${part[1]}`);

    return parts.length ? `Scope | ${parts.join(' | ')}` : 'Scope | not identified';
  }

  private buildTableLine(tableName: string, table: RememberedTable): string {
    const columns = table.columns
      .map((column) => (column.type ? `${column.name} ${column.type}` : column.name))
      .join(', ');
    const omitted = table.totalColumns > table.columns.length
      ? ` (+${table.totalColumns - table.columns.length} more columns not listed)`
      : '';

    return `- ${tableName}: ${columns}${omitted}`;
  }

  private fitBlock(sections: string[]): string {
    const block = sections.join('\n');

    if (block.length <= MAX_PROMPT_BLOCK_CHARS) {
      return block;
    }

    const reduced = [...sections];

    while (reduced.length > 3 && reduced.join('\n').length > MAX_PROMPT_BLOCK_CHARS) {
      reduced.splice(reduced.length - 3, 1);
    }

    return reduced.join('\n').slice(0, MAX_PROMPT_BLOCK_CHARS);
  }

  private rememberObjects(entry: ConnectionMemory, names: string[], type: 'table' | 'view'): void {
    const target = type === 'table' ? entry.tables : entry.views;

    for (const name of names) {
      if (!name || target.includes(name)) {
        continue;
      }

      target.push(name);
    }

    if (target.length > MAX_OBJECTS_PER_CONNECTION) {
      target.splice(0, target.length - MAX_OBJECTS_PER_CONNECTION);
    }
  }

  private rememberColumns(entry: ConnectionMemory, data: Record<string, unknown>): void {
    const tableName = typeof data['tableName'] === 'string' ? data['tableName'].trim() : '';
    const rawColumns = Array.isArray(data['columns']) ? data['columns'] : [];

    if (!tableName || !rawColumns.length) {
      return;
    }

    const columns = rawColumns
      .map((column) => this.readColumn(column))
      .filter((column): column is RememberedColumn => column !== null)
      .slice(0, MAX_COLUMNS_PER_TABLE);

    if (!columns.length) {
      return;
    }

    const totalColumns = Number(data['totalColumns']);

    entry.columnsByTable.set(tableName, {
      columns,
      totalColumns: Number.isFinite(totalColumns) ? Math.max(totalColumns, columns.length) : columns.length,
      updatedAt: Date.now()
    });

    if (entry.columnsByTable.size > MAX_TABLES_WITH_COLUMNS) {
      const oldest = [...entry.columnsByTable.entries()]
        .sort((left, right) => left[1].updatedAt - right[1].updatedAt)
        .slice(0, entry.columnsByTable.size - MAX_TABLES_WITH_COLUMNS);

      for (const [staleTable] of oldest) {
        entry.columnsByTable.delete(staleTable);
      }
    }
  }

  private readColumn(value: unknown): RememberedColumn | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const name = this.readString(record['name']);

    if (!name) {
      return null;
    }

    return { name, type: this.readString(record['type']) };
  }

  private readNames(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => (item && typeof item === 'object'
        ? this.readString((item as Record<string, unknown>)['name'])
        : ''))
      .filter((name) => name.length > 0);
  }

  private readNamesByType(matches: unknown[], type: 'table' | 'view'): string[] {
    return matches
      .filter((match) => match && typeof match === 'object' && (match as Record<string, unknown>)['type'] === type)
      .map((match) => this.readString((match as Record<string, unknown>)['name']))
      .filter((name) => name.length > 0);
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private getOrCreateEntry(context: AiReadonlyDatabaseContext): ConnectionMemory | null {
    this.prune();
    const key = this.buildKey(context);
    const existing = this.memory.get(key);

    if (existing) {
      existing.identity = this.buildIdentity(context);
      return existing;
    }

    if (this.memory.size >= MAX_CONNECTIONS) {
      const oldest = [...this.memory.entries()]
        .sort((left, right) => left[1].updatedAt - right[1].updatedAt)[0];

      if (oldest) {
        this.memory.delete(oldest[0]);
      }
    }

    const entry: ConnectionMemory = {
      identity: this.buildIdentity(context),
      tables: [],
      views: [],
      columnsByTable: new Map<string, RememberedTable>(),
      updatedAt: Date.now()
    };

    this.memory.set(key, entry);
    return entry;
  }

  private buildIdentity(context: AiReadonlyDatabaseContext): ConnectionIdentity {
    return {
      connectionName: this.readString(context.connectionName),
      sgbd: this.readString(context.sgbd),
      version: this.readString(context.version),
      database: this.readString(context.database),
      schema: this.readString(context.schema)
    };
  }

  private buildKey(context: AiReadonlyDatabaseContext): string {
    return [
      this.readString(context.sgbd).toLowerCase(),
      this.readString(context.connectionKey),
      this.readString(context.database).toLowerCase(),
      this.readString(context.schema).toLowerCase()
    ].join('|');
  }

  private isExpired(entry: ConnectionMemory): boolean {
    return Date.now() - entry.updatedAt > ENTRY_TTL_MS;
  }

  private prune(): void {
    for (const [key, entry] of this.memory.entries()) {
      if (this.isExpired(entry)) {
        this.memory.delete(key);
      }
    }
  }
}

export default new AiAssistantSchemaMemoryService();
