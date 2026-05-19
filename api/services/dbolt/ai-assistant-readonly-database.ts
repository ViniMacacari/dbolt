import ListObjectsHanaV1 from '../database-info/hana/hana-v1.js';
import ListObjectsMySQLV1 from '../database-info/mysql/mysql5.js';
import ListObjectsPgV1 from '../database-info/postgres/v9.js';
import ListObjectsSQLServerV1 from '../database-info/sqlserver/v2008.js';
import ListObjectsSQLiteV3 from '../database-info/sqlite/v3.js';

import type {
  DatabaseObjectsResult,
  QueryRow,
  TableColumnsResult
} from '../../types.js';

const DEFAULT_OBJECT_LIMIT = 80;
const DEFAULT_COLUMN_LIMIT = 120;
const MAX_OBJECT_LIMIT = 200;
const MAX_COLUMN_LIMIT = 200;

type DatabaseInfoProvider = {
  listTableObjects: (connectionKey?: string) => Promise<DatabaseObjectsResult>;
  tableColumns: (tableName: string, connectionKey?: string) => Promise<TableColumnsResult>;
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
      throw new Error(this.getServiceErrorMessage(result, 'Não foi possível consultar os objetos do banco.'));
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
      throw new Error('Nome da tabela não informado.');
    }

    const provider = this.getDatabaseInfoProvider(context);
    const normalizedLimit = this.normalizeLimit(limit, DEFAULT_COLUMN_LIMIT, MAX_COLUMN_LIMIT);
    const result = await provider.tableColumns(normalizedTableName, context.connectionKey);

    if (!result.success) {
      throw new Error(this.getServiceErrorMessage(result, 'Não foi possível consultar as colunas da tabela.'));
    }

    const columns = (result.data || []) as QueryRow[];

    return {
      tableName: normalizedTableName,
      columns: columns.slice(0, normalizedLimit),
      totalColumns: columns.length,
      truncated: columns.length > normalizedLimit
    };
  }

  async buildPromptContext(
    context: AiReadonlyDatabaseContext | undefined,
    userMessages: Array<{ content: string }>
  ): Promise<string | null> {
    if (!context?.sgbd) {
      return null;
    }

    const question = userMessages.map((message) => message.content).join('\n');
    const tableNames = this.extractTableNames(question).slice(0, 4);
    const sections: string[] = [];

    if (tableNames.length > 0) {
      for (const tableName of tableNames) {
        try {
          const columns = await this.getTableColumns(context, tableName);
          sections.push(`Tabela ${tableName}: ${columns.totalColumns} coluna(s).`);
          sections.push(JSON.stringify({
            tableName,
            totalColumns: columns.totalColumns,
            columns: columns.columns,
            truncated: columns.truncated
          }));
        } catch (error: unknown) {
          sections.push(`Não foi possível consultar colunas de ${tableName}: ${this.getErrorMessage(error)}`);
        }
      }
    }

    if (sections.length === 0 && this.shouldLoadSchemaSummary(question)) {
      try {
        const summary = await this.getSchemaSummary(context, 60);
        sections.push(JSON.stringify(summary));
      } catch (error: unknown) {
        sections.push(`Não foi possível consultar resumo do schema: ${this.getErrorMessage(error)}`);
      }
    }

    if (sections.length === 0) {
      return null;
    }

    return [
      'Consultas readonly feitas pelo DBOLT antes de responder. Use estes dados como fonte factual.',
      'Não execute nem sugira comandos de escrita como UPDATE, DELETE, INSERT, DROP, ALTER ou TRUNCATE.',
      ...sections
    ].join('\n');
  }

  private extractTableNames(question: string): string[] {
    const candidates: string[] = [];
    const directPatterns = [
      /\b(?:tabela|table|view)\s+[`"'\[]?([A-Za-z_][A-Za-z0-9_.$]*)[`"'\]]?/gi,
      /\b(?:da|de|na|no)\s+(?:tabela|table|view)\s+[`"'\[]?([A-Za-z_][A-Za-z0-9_.$]*)[`"'\]]?/gi
    ];

    for (const pattern of directPatterns) {
      for (const match of question.matchAll(pattern)) {
        if (match[1]) candidates.push(match[1]);
      }
    }

    for (const match of question.matchAll(/[`"'\[]([A-Za-z_][A-Za-z0-9_.$]{1,80})[`"'\]]/g)) {
      if (match[1]) candidates.push(match[1]);
    }

    for (const match of question.matchAll(/\b[A-Z][A-Z0-9_]{2,63}\b/g)) {
      candidates.push(match[0]);
    }

    const stopWords = new Set(['SQL', 'SAP', 'DBOLT', 'HANA', 'MYSQL', 'POSTGRES', 'SQLSERVER']);
    const uniqueCandidates: string[] = [];

    candidates
      .map((candidate) => candidate.replace(/[.,;:!?)]$/g, '').trim())
      .filter((candidate) => candidate && !stopWords.has(candidate.toUpperCase()))
      .forEach((candidate) => {
        const key = candidate.toLowerCase();
        if (!uniqueCandidates.some((item) => item.toLowerCase() === key)) {
          uniqueCandidates.push(candidate);
        }
      });

    return uniqueCandidates;
  }

  private shouldLoadSchemaSummary(question: string): boolean {
    return /\b(tabelas?|views?|schema|banco|objetos?|colunas?)\b/i.test(question);
  }

  private getDatabaseInfoProvider(context: AiReadonlyDatabaseContext): DatabaseInfoProvider {
    const database = String(context.sgbd || '').toLowerCase();

    if (database === 'hana') return ListObjectsHanaV1;
    if (database === 'mysql') return ListObjectsMySQLV1;
    if (database === 'postgres') return ListObjectsPgV1;
    if (database === 'sqlserver') return ListObjectsSQLServerV1;
    if (database === 'sqlite') return ListObjectsSQLiteV3;

    throw new Error(`Banco de dados não suportado pelo contexto readonly da IA: ${context.sgbd || 'desconhecido'}`);
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
