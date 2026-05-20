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
      'Ferramentas readonly disponíveis quando o usuário autorizou contexto do banco:',
      '- searchObjects: busca tabelas/views por nome parcial. Args: {"search":"texto","types":["table","view"],"limit":160}. Use antes de getTableColumns quando não souber o nome exato.',
      '- getTableColumns: lista metadados de colunas de uma tabela/view. Args: {"tableName":"OINV","limit":60}.',
      '- getSchemaSummary: resumo pequeno de tabelas/views. Args: {"search":"opcional","limit":30}. Use só quando uma busca específica não bastar.',
      '- runReadonlyQuery: executa somente SELECT/WITH com limite. Args: {"sql":"SELECT ...","maxRows":50}. Nunca use para INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, EXEC ou múltiplas instruções.',
      'Use runReadonlyQuery quando a pergunta pedir valores de linhas, IDs, e-mails, nomes, contagens ou qualquer dado que dependa do conteúdo da tabela.',
      'Se ainda faltar informação para montar o SELECT com segurança, peça outra ferramenta primeiro; se já souber tabela e colunas, execute o SELECT readonly.',
      'Para pedir ferramentas, responda SOMENTE com JSON válido neste formato:',
      '{"toolCalls":[{"name":"searchObjects","arguments":{"search":"OINV","types":["table","view"],"limit":20}}]}',
      'Peça no máximo duas ferramentas por rodada. Quando tiver dados suficientes, responda normalmente ao usuário, sem JSON de ferramenta.'
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
        content: `Erro ao executar ${toolCall.name}: ${this.getErrorMessage(error)}`
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
      tool: 'searchObjects',
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
      tool: 'getTableColumns',
      tableName: result.tableName,
      totalColumns: result.totalColumns,
      columns: result.columns.map((column) => this.compactColumn(column)),
      truncated: result.truncated
    }, this.jsonReplacer);
  }

  private formatSchemaSummary(result: AiReadonlySchemaSummary): string {
    return JSON.stringify({
      tool: 'getSchemaSummary',
      connection: result.connection,
      counts: result.counts,
      tables: result.tables,
      views: result.views,
      truncated: result.truncated
    });
  }

  private formatQueryExecution(result: AiReadonlyQueryExecution): string {
    return JSON.stringify({
      tool: 'runReadonlyQuery',
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
      throw new Error(`Argumento obrigatório não informado: ${key}`);
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
}

export default new AiAssistantToolsService();
