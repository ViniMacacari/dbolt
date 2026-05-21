import AiAssistantReadonlyDatabase, {
  type AiReadonlyDatabaseContext,
  type AiReadonlyObjectSearch,
  type AiReadonlyQueryExecution,
  type AiReadonlySchemaSummary,
  type AiReadonlyTableColumns
} from './ai-assistant-readonly-database.js';
import AiAssistantToolBudget, {
  type AiAssistantToolBudgetState
} from './ai-assistant-tool-budget.js';

import type { QueryRow } from '../../types.js';

export type AiAssistantReadonlyToolName =
  | 'searchObjects'
  | 'getTableColumns'
  | 'getSchemaSummary'
  | 'runReadonlyQuery';

export interface AiAssistantToolCall {
  name: AiAssistantReadonlyToolName;
  arguments: Record<string, unknown>;
}

export interface AiAssistantToolExecutionResult {
  name: AiAssistantReadonlyToolName;
  success: boolean;
  content: string;
}

const VALID_TOOL_NAMES = new Set<AiAssistantReadonlyToolName>([
  'searchObjects',
  'getTableColumns',
  'getSchemaSummary',
  'runReadonlyQuery'
]);

class AiAssistantToolsService {
  isValidToolName(name: string): name is AiAssistantReadonlyToolName {
    return VALID_TOOL_NAMES.has(name as AiAssistantReadonlyToolName);
  }

  getToolInstructions(): string {
    return [
      'Read-only database actions available when the user authorized database context:',
      '- searchObjects: searches tables/views by partial name. Args: {"search":"text","types":["table","view"],"limit":160}. Use before getTableColumns when you do not know the exact name.',
      '- getTableColumns: lists column metadata for a table/view. Args: {"tableName":"TABLE_NAME","limit":60}.',
      '- getSchemaSummary: small summary of tables/views. Args: {"search":"optional","limit":30}. Use only when a specific search is not enough.',
      '- runReadonlyQuery: runs only SELECT/WITH with a row limit. Args: {"sql":"SELECT ...","maxRows":50}. Never use it for INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, EXEC, or multiple statements.',
      'For object discovery, choose concise search terms from the user intent and database naming context. If the first search has no useful match, try a broader or alternative term within the database action budget.',
      'Use runReadonlyQuery when the question asks for row values, IDs, emails, names, counts, or any data that depends on table contents.',
      'Before runReadonlyQuery, use getTableColumns when the exact column names for the target table have not already been returned in the current DBOLT read-only data. Do not guess columns.',
      'If you still need information to build the SELECT safely, request another database action first; if you already know the table and columns, run the read-only SELECT.',
      'When the user asks for current database data and a database action is needed, do not answer with a SQL code block or prose. Reply only with databaseActions JSON.',
      'Only provide SQL text instead of databaseActions when the user explicitly asks for SQL/query/script text rather than asking you to consult the data.',
      'To request database actions, reply ONLY with valid JSON text in this format:',
      '{"databaseActions":[{"name":"searchObjects","arguments":{"search":"TABLE_NAME","types":["table","view"],"limit":20}}]}',
      'Do not use bracket syntax such as [database-action:getTableColumns:tableName=users]. That is not the preferred request format.',
      'Request at most two database actions per round. When you have enough data, answer the user normally, without database action JSON.'
    ].join('\n');
  }

  async execute(
    context: AiReadonlyDatabaseContext,
    toolCall: AiAssistantToolCall,
    budget: AiAssistantToolBudgetState
  ): Promise<AiAssistantToolExecutionResult> {
    try {
      const content = await this.executeTool(context, toolCall);

      return {
        name: toolCall.name,
        success: true,
        content: AiAssistantToolBudget.limitText(content, budget.maxToolResultChars)
      };
    } catch (error: unknown) {
      return {
        name: toolCall.name,
        success: false,
        content: this.buildToolErrorContent(context, toolCall, error)
      };
    }
  }

  private async executeTool(
    context: AiReadonlyDatabaseContext,
    toolCall: AiAssistantToolCall
  ): Promise<string> {
    if (toolCall.name === 'searchObjects') {
      return this.formatObjectSearch(await AiAssistantReadonlyDatabase.searchObjects(
        context,
        this.readString(toolCall.arguments, 'search'),
        this.readLimit(toolCall.arguments, 'limit', 160, 300),
        this.readObjectTypes(toolCall.arguments)
      ));
    }

    if (toolCall.name === 'getTableColumns') {
      return this.formatTableColumns(await AiAssistantReadonlyDatabase.getTableColumns(
        context,
        this.readString(toolCall.arguments, 'tableName'),
        this.readLimit(toolCall.arguments, 'limit', 60, 120)
      ));
    }

    if (toolCall.name === 'getSchemaSummary') {
      return this.formatSchemaSummary(await AiAssistantReadonlyDatabase.getSchemaSummary(
        context,
        this.readLimit(toolCall.arguments, 'limit', 120, 250),
        this.readOptionalString(toolCall.arguments, 'search')
      ));
    }

    return this.formatQueryExecution(await AiAssistantReadonlyDatabase.runReadOnlyQuery(
      context,
      this.readString(toolCall.arguments, 'sql'),
      this.readLimit(toolCall.arguments, 'maxRows', 50, 100)
    ));
  }

  private formatObjectSearch(result: AiReadonlyObjectSearch): string {
    return JSON.stringify({
      action: 'searchObjects',
      search: result.query,
      searchedTypes: result.types,
      totalTablesInSchema: result.counts.tables,
      totalViewsInSchema: result.counts.views,
      totalMatches: result.totalMatches,
      matches: result.matches,
      truncated: result.truncated
    });
  }

  private formatTableColumns(result: AiReadonlyTableColumns): string {
    return JSON.stringify({
      action: 'getTableColumns',
      tableName: result.tableName,
      totalColumns: result.totalColumns,
      columns: result.columns.map((column) => this.compactColumn(column)),
      truncated: result.truncated
    }, this.jsonReplacer);
  }

  private formatSchemaSummary(result: AiReadonlySchemaSummary): string {
    return JSON.stringify({
      action: 'getSchemaSummary',
      connection: result.connection,
      counts: result.counts,
      tables: result.tables,
      views: result.views,
      truncated: result.truncated
    });
  }

  private formatQueryExecution(result: AiReadonlyQueryExecution): string {
    return JSON.stringify({
      action: 'runReadonlyQuery',
      sql: result.sql,
      columns: result.columns,
      returnedRows: result.returnedRows,
      totalRows: result.totalRows,
      rows: result.rows,
      truncated: result.truncated
    }, this.jsonReplacer);
  }

  private compactColumn(column: QueryRow): QueryRow {
    return {
      name: column['name'] || column['column_name'] || column['COLUMN_NAME'],
      type: column['type'] || column['data_type'] || column['DATA_TYPE_NAME'],
      length: column['length'] || column['character_maximum_length'],
      precision: column['numeric_precision'],
      scale: column['scale'] || column['numeric_scale'],
      nullable: column['is_nullable'],
      default: column['default_value'] || column['column_default'],
      ordinal: column['ordinal_position']
    };
  }

  private readString(args: Record<string, unknown>, key: string): string {
    const value = args[key];

    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Required argument was not provided: ${key}`);
    }

    return value.trim();
  }

  private readOptionalString(args: Record<string, unknown>, key: string): string {
    const value = args[key];
    return typeof value === 'string' ? value.trim() : '';
  }

  private readLimit(args: Record<string, unknown>, key: string, fallback: number, max: number): number {
    const parsed = Number(args[key]);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.max(1, Math.min(max, Math.floor(parsed)));
  }

  private readObjectTypes(args: Record<string, unknown>): Array<'table' | 'view'> | undefined {
    const rawTypes = args['types'];

    if (!Array.isArray(rawTypes)) {
      return undefined;
    }

    const types = rawTypes.filter((type): type is 'table' | 'view' =>
      type === 'table' || type === 'view'
    );

    return types.length > 0 ? types : undefined;
  }

  private jsonReplacer(_key: string, value: unknown): unknown {
    return typeof value === 'bigint' ? value.toString() : value;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private buildToolErrorContent(
    context: AiReadonlyDatabaseContext,
    toolCall: AiAssistantToolCall,
    error: unknown
  ): string {
    const message = this.getErrorMessage(error);
    const guidance: string[] = [];
    const lowerMessage = message.toLowerCase();

    if (
      toolCall.name === 'runReadonlyQuery' &&
      /\b(column|table|object|identifier)\b/.test(lowerMessage)
    ) {
      guidance.push('Do not guess table or column names. Request getTableColumns for the target table or searchObjects if the table is uncertain, then retry with exact metadata names.');
    }

    if (toolCall.name === 'runReadonlyQuery' && String(context.sgbd || '').toLowerCase() === 'hana') {
      guidance.push('For SAP HANA, quote table and column identifiers with double quotes using exact metadata case, for example "DocEntry". Unquoted mixed-case identifiers are uppercased by HANA.');
    }

    return [
      `Error while running ${toolCall.name}: ${message}`,
      ...guidance
    ].join('\n');
  }
}

export default new AiAssistantToolsService();
