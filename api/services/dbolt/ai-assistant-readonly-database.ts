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
import { quoteIdentifier, quoteSqlServerIdentifier } from '../../utils/sql-identifiers.js';

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
const PROMPT_COLUMN_LIMIT = 60;
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

  async searchObjects(
    context: AiReadonlyDatabaseContext,
    search: string,
    limit = DEFAULT_SEARCH_LIMIT,
    types?: DatabaseObjectType[]
  ): Promise<AiReadonlyObjectSearch> {
    const normalizedSearch = String(search || '').trim();
    if (!normalizedSearch) {
      throw new Error('Termo de busca não informado.');
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
      throw new Error(this.getServiceErrorMessage(result, 'Não foi possível executar a consulta readonly.'));
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

  async buildPromptContext(
    context: AiReadonlyDatabaseContext | undefined,
    userMessages: Array<{ content: string }>
  ): Promise<string | null> {
    if (!context?.sgbd) {
      return null;
    }

    const question = userMessages[userMessages.length - 1]?.content || '';
    const tableNames = this.extractTableNames(question).slice(0, 4);
    const sections: string[] = [];

    for (const sql of this.extractReadOnlySqlStatements(question).slice(0, 2)) {
      try {
        sections.push(this.formatQueryResult(await this.runReadOnlyQuery(context, sql)));
      } catch (error: unknown) {
        sections.push(`Não foi possível executar a consulta readonly: ${this.getErrorMessage(error)}`);
      }
    }

    for (const search of this.extractObjectSearches(question).slice(0, 3)) {
      try {
        sections.push(this.formatObjectSearch(
          await this.searchObjects(context, search.term, DEFAULT_SEARCH_LIMIT, search.types)
        ));
      } catch (error: unknown) {
        sections.push(`Não foi possível buscar objetos por "${search.term}": ${this.getErrorMessage(error)}`);
      }
    }

    if (this.isRowCountQuestion(question) && tableNames.length > 0) {
      for (const tableName of tableNames.slice(0, 2)) {
        try {
          sections.push(this.formatQueryResult(await this.runReadOnlyQuery(
            context,
            `SELECT COUNT(*) AS total FROM ${this.quoteTableIdentifier(context, tableName)}`,
            1
          )));
        } catch (error: unknown) {
          sections.push(`Não foi possível contar registros de ${tableName}: ${this.getErrorMessage(error)}`);
        }
      }
    }

    if (this.isColumnQuestion(question) && tableNames.length > 0) {
      const includeColumnList = this.shouldListColumns(question);

      for (const tableName of tableNames.slice(0, 3)) {
        try {
          const columns = await this.getTableColumns(context, tableName);
          sections.push(this.formatTableColumns(columns, includeColumnList));
        } catch (error: unknown) {
          sections.push(`Não foi possível consultar colunas de ${tableName}: ${this.getErrorMessage(error)}`);
        }
      }
    }

    if (sections.length === 0 && this.shouldLoadSchemaSummary(question)) {
      try {
        sections.push(this.formatSchemaSummary(await this.getSchemaSummary(context, 30)));
      } catch (error: unknown) {
        sections.push(`Não foi possível consultar resumo do schema: ${this.getErrorMessage(error)}`);
      }
    }

    if (sections.length === 0) {
      return null;
    }

    return [
      'Dados readonly consultados pelo DBOLT antes de responder. Use estes dados como fonte factual.',
      'O contexto foi limitado de propósito para economizar tokens; não assuma objetos ou colunas fora dos dados abaixo.',
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

  private extractObjectSearches(question: string): Array<{ term: string; types?: DatabaseObjectType[] }> {
    if (!/\b(tabelas?|tables?|views?|objetos?)\b/i.test(question)) {
      return [];
    }

    const types = this.getMentionedObjectTypes(question);
    const terms = this.extractSearchTerms(question);

    return terms.map((term) => ({ term, types }));
  }

  private extractSearchTerms(question: string): string[] {
    const candidates: string[] = [];
    const quotedPattern = /[`"']([^`"']{2,80})[`"']/g;
    const namedPatterns = [
      /\b(?:nome|chamad[ao]|cont[eé]m|come[cç]a(?:ndo)?|termina(?:ndo)?|parecid[ao])\s+(?:de|com|por|a|o)?\s*([A-Za-z0-9_$#.-]{2,80})/gi,
      /\b(?:com|por)\s+([A-Za-z0-9_$#.-]{2,80})\b/gi
    ];

    for (const match of question.matchAll(quotedPattern)) {
      candidates.push(match[1]);
    }

    for (const pattern of namedPatterns) {
      for (const match of question.matchAll(pattern)) {
        candidates.push(match[1]);
      }
    }

    for (const match of question.matchAll(/\b[A-Z][A-Z0-9_$#]{2,80}\b/g)) {
      candidates.push(match[0]);
    }

    const stopWords = new Set([
      'SQL', 'SAP', 'DBOLT', 'HANA', 'MYSQL', 'POSTGRES', 'SQLSERVER', 'SELECT',
      'VIEW', 'VIEWS', 'TABELA', 'TABELAS', 'TABLE', 'TABLES', 'BANCO', 'DADOS',
      'NOME', 'ALGUMA', 'ALGUM', 'TENHO', 'MEU', 'MINHA'
    ]);
    const uniqueTerms: string[] = [];

    candidates
      .map((candidate) => candidate.replace(/[.,;:!?)]$/g, '').trim())
      .filter((candidate) => candidate.length >= 2 && !stopWords.has(candidate.toUpperCase()))
      .forEach((candidate) => {
        const key = candidate.toLowerCase();
        if (!uniqueTerms.some((term) => term.toLowerCase() === key)) {
          uniqueTerms.push(candidate);
        }
      });

    return uniqueTerms;
  }

  private getMentionedObjectTypes(question: string): DatabaseObjectType[] | undefined {
    const mentionsView = /\bviews?\b/i.test(question);
    const mentionsTable = /\b(tabelas?|tables?)\b/i.test(question);

    if (mentionsView && !mentionsTable) return ['view'];
    if (mentionsTable && !mentionsView) return ['table'];

    return undefined;
  }

  private extractReadOnlySqlStatements(question: string): string[] {
    const candidates: string[] = [];

    for (const match of question.matchAll(/```(?:sql)?\s*([\s\S]*?)```/gi)) {
      if (match[1]) {
        candidates.push(match[1].trim());
      }
    }

    const trimmedQuestion = question.trim();
    if (/^(select|with)\b/i.test(trimmedQuestion)) {
      candidates.push(trimmedQuestion);
    }

    const uniqueQueries: string[] = [];
    candidates
      .filter((candidate) => candidate.length > 0 && candidate.length <= 5000)
      .forEach((candidate) => {
        const key = candidate.toLowerCase();
        if (!uniqueQueries.some((query) => query.toLowerCase() === key)) {
          uniqueQueries.push(candidate);
        }
      });

    return uniqueQueries;
  }

  private isColumnQuestion(question: string): boolean {
    return /\b(colunas?|campos?|columns?|fields?)\b/i.test(question);
  }

  private shouldListColumns(question: string): boolean {
    if (/\b(quantas?|total|count)\b.*\b(colunas?|columns?)\b/i.test(question)) {
      return false;
    }

    return /\b(quais|listar?|liste|mostr[ae]|exibir|colunas?|campos?)\b/i.test(question);
  }

  private isRowCountQuestion(question: string): boolean {
    return /\b(quantos?|total|count)\b.*\b(registros?|linhas?|rows?)\b/i.test(question) ||
      /\b(registros?|linhas?|rows?)\b.*\b(quantos?|total|count)\b/i.test(question);
  }

  private async loadTableObjects(context: AiReadonlyDatabaseContext): Promise<{
    tables: Array<{ name: string; type?: string }>;
    views: Array<{ name: string; type?: string }>;
  }> {
    const provider = this.getDatabaseInfoProvider(context);
    const result = await provider.listTableObjects(context.connectionKey);

    if (!result.success) {
      throw new Error(this.getServiceErrorMessage(result, 'Não foi possível consultar os objetos do banco.'));
    }

    return {
      tables: (result.tables || []).map((object) => ({ name: object.name, type: object.type })),
      views: (result.views || []).map((object) => ({ name: object.name, type: object.type }))
    };
  }

  private normalizeReadOnlySql(sql: string): string {
    const executableSql = trimStatementTerminator(String(sql || '').trim());

    if (!executableSql) {
      throw new Error('SQL não informado.');
    }

    if (!isReadOnlySelectQuery(executableSql)) {
      throw new Error('A IA só pode executar consultas readonly começando com SELECT ou WITH.');
    }

    if (this.hasAdditionalSqlStatements(executableSql)) {
      throw new Error('A IA só pode executar uma consulta readonly por vez.');
    }

    if (this.containsBlockedSqlKeyword(executableSql)) {
      throw new Error('A consulta contém comando não permitido para o modo readonly.');
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

  private quoteTableIdentifier(context: AiReadonlyDatabaseContext, tableName: string): string {
    const database = String(context.sgbd || '').toLowerCase();
    const parts = tableName.split('.').map((part) => part.trim()).filter(Boolean);
    const quote = (identifier: string): string => {
      if (database === 'sqlserver') return quoteSqlServerIdentifier(identifier, 'Table name');
      if (database === 'mysql' || database === 'sqlite') return quoteIdentifier(identifier, '`');
      return quoteIdentifier(identifier, '"');
    };

    return parts.map(quote).join('.');
  }

  private formatSchemaSummary(summary: AiReadonlySchemaSummary): string {
    const tables = summary.tables.map((object) => object.name).join(', ') || 'nenhuma no limite consultado';
    const views = summary.views.map((object) => object.name).join(', ') || 'nenhuma no limite consultado';

    return [
      `Resumo do schema ${summary.connection.schema || summary.connection.database || ''}:`,
      `Total de tabelas: ${summary.counts.tables}. Total de views: ${summary.counts.views}.`,
      `Tabelas retornadas (${summary.tables.length}): ${tables}.`,
      `Views retornadas (${summary.views.length}): ${views}.`,
      summary.truncated ? 'Resultado truncado pelo limite readonly.' : ''
    ].filter(Boolean).join('\n');
  }

  private formatObjectSearch(search: AiReadonlyObjectSearch): string {
    const typeLabel = search.types.length === 1
      ? (search.types[0] === 'view' ? 'views' : 'tabelas')
      : 'tabelas/views';
    const matches = search.matches
      .map((object) => `- ${object.type}: ${object.name}`)
      .join('\n') || '- nenhum objeto encontrado';

    return [
      `Busca readonly em ${typeLabel} por "${search.query}": ${search.totalMatches} encontrado(s).`,
      `Schema possui ${search.counts.tables} tabela(s) e ${search.counts.views} view(s).`,
      matches,
      search.truncated ? 'Resultado truncado pelo limite readonly.' : ''
    ].filter(Boolean).join('\n');
  }

  private formatTableColumns(columns: AiReadonlyTableColumns, includeColumnList: boolean): string {
    const lines = [`Tabela/view ${columns.tableName}: ${columns.totalColumns} coluna(s).`];

    if (includeColumnList) {
      const columnLines = columns.columns
        .slice(0, PROMPT_COLUMN_LIMIT)
        .map((column) => {
          const name = String(column['name'] || column['column_name'] || column['COLUMN_NAME'] || '');
          const type = String(column['type'] || column['data_type'] || column['DATA_TYPE_NAME'] || '').trim();
          return type ? `- ${name}: ${type}` : `- ${name}`;
        })
        .filter((line) => line !== '- ');

      lines.push(columnLines.join('\n') || '- nenhuma coluna retornada');

      if (columns.totalColumns > PROMPT_COLUMN_LIMIT || columns.truncated) {
        lines.push('Lista de colunas truncada pelo limite readonly.');
      }
    } else {
      lines.push('Lista de colunas omitida por economia de tokens; a pergunta pediu apenas contagem/resumo.');
    }

    return lines.join('\n');
  }

  private formatQueryResult(result: AiReadonlyQueryExecution): string {
    return [
      'Consulta readonly executada:',
      `SQL: ${this.truncateText(result.sql, 500)}`,
      `Linhas retornadas pela consulta: ${result.returnedRows}. Amostra enviada ao modelo: ${result.rows.length}. Total informado pelo banco: ${result.totalRows ?? 'indisponível'}.`,
      `Colunas: ${result.columns.join(', ') || 'indisponíveis'}.`,
      `Amostra JSON: ${JSON.stringify(result.rows)}`,
      result.truncated ? 'Resultado truncado pelo limite readonly.' : ''
    ].filter(Boolean).join('\n');
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

    throw new Error(`Banco de dados não suportado pelo contexto readonly da IA: ${context.sgbd || 'desconhecido'}`);
  }

  private getDatabaseQueryProvider(context: AiReadonlyDatabaseContext): DatabaseQueryProvider {
    const database = String(context.sgbd || '').toLowerCase();

    if (database === 'hana') return QueryHanaV1;
    if (database === 'mysql') return QueryMySQLV1;
    if (database === 'postgres') return QueryPgV1;
    if (database === 'sqlserver') return QuerySQLServerV1;
    if (database === 'sqlite') return QuerySQLiteV3;

    throw new Error(`Banco de dados não suportado para consulta readonly da IA: ${context.sgbd || 'desconhecido'}`);
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
