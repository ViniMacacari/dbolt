import AiAssistantModelClient, {
  type AiModelMessage
} from './ai-assistant-model-client.js';
import AiAssistantReadonlyDatabase, {
  type AiReadonlyDatabaseContext
} from './ai-assistant-readonly-database.js';
import AiAssistantToolBudget, {
  type AiAssistantToolBudgetState
} from './ai-assistant-tool-budget.js';
import AiAssistantTools, {
  type AiAssistantToolCall
} from './ai-assistant-tools.js';

import type { AiAssistantResolvedSettings } from './ai-assistant-settings.js';

export interface AiAssistantAgentChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiAssistantAgentChatRequest {
  messages: AiAssistantAgentChatMessage[];
  readonlyContext?: AiReadonlyDatabaseContext;
}

export interface AiAssistantAgentChatResult {
  message: string;
  model: string;
}

class AiAssistantAgentService {
  async chat(
    request: AiAssistantAgentChatRequest,
    settings: AiAssistantResolvedSettings
  ): Promise<AiAssistantAgentChatResult> {
    const messages = this.normalizeMessages(request.messages);
    const readonlyContext = request.readonlyContext?.sgbd ? request.readonlyContext : undefined;
    const budget = AiAssistantToolBudget.createState();
    const toolSections: string[] = [];
    const preloadedContext = await this.buildPreloadedContext(readonlyContext, messages);

    if (preloadedContext) {
      toolSections.push(`[contexto-readonly-precarregado]\n${preloadedContext}`);
    }

    let lastModel = settings.model;

    while (AiAssistantToolBudget.beginIteration(budget)) {
      const completion = await AiAssistantModelClient.complete(
        settings,
        this.buildSystemPrompt(readonlyContext, budget, toolSections, false),
        messages
      );
      lastModel = completion.model;

      const toolCalls = readonlyContext
        ? this.parseToolCalls(completion.content)
        : [];

      if (toolCalls.length === 0) {
        return {
          message: this.cleanFinalAnswer(completion.content),
          model: lastModel
        };
      }

      if (!readonlyContext) {
        return {
          message: 'Não há contexto readonly de banco autorizado para executar consultas.',
          model: lastModel
        };
      }

      const executableCalls = toolCalls.slice(
        0,
        Math.min(budget.maxToolCallsPerIteration, AiAssistantToolBudget.getRemainingToolCalls(budget))
      );

      if (executableCalls.length === 0 || !AiAssistantToolBudget.canRunTool(budget)) {
        break;
      }

      for (const toolCall of executableCalls) {
        AiAssistantToolBudget.registerToolCall(budget);
        const result = await AiAssistantTools.execute(readonlyContext, toolCall, budget);
        toolSections.push([
          `[ferramenta:${result.name}:${result.success ? 'ok' : 'erro'}]`,
          result.content
        ].join('\n'));
      }
    }

    const finalCompletion = await AiAssistantModelClient.complete(
      settings,
      this.buildSystemPrompt(readonlyContext, budget, toolSections, true),
      messages
    );

    return {
      message: this.cleanFinalAnswer(finalCompletion.content),
      model: finalCompletion.model || lastModel
    };
  }

  private async buildPreloadedContext(
    readonlyContext: AiReadonlyDatabaseContext | undefined,
    messages: AiModelMessage[]
  ): Promise<string | null> {
    if (!readonlyContext) {
      return null;
    }

    const lastQuestion = messages[messages.length - 1]?.content || '';
    if (!this.shouldPreloadReadonlyContext(lastQuestion)) {
      return null;
    }

    return await AiAssistantReadonlyDatabase.buildPromptContext(
      readonlyContext,
      [{ content: lastQuestion }]
    );
  }

  private shouldPreloadReadonlyContext(question: string): boolean {
    return /```(?:sql)?|^(select|with)\b/i.test(question.trim()) ||
      /\b[A-Z][A-Z0-9_]{2,63}\b/.test(question) ||
      /\b(colunas?|campos?|columns?|fields?)\b.*\b(tabela|table|view)\b/i.test(question) ||
      /\b(quantos?|total|count)\b.*\b(registros?|linhas?|rows?)\b/i.test(question);
  }

  private buildSystemPrompt(
    readonlyContext: AiReadonlyDatabaseContext | undefined,
    budget: AiAssistantToolBudgetState,
    toolSections: string[],
    forceFinalAnswer: boolean
  ): string {
    const parts = [
      'Você é o assistente de IA do DBOLT Database Manager.',
      'Responda em português do Brasil, com foco em SQL, modelagem, investigação de schema e produtividade.',
      'Não solicite senhas, tokens ou chaves da API.',
      'Não invente tabelas, colunas ou resultados. Quando houver dados de ferramentas readonly, trate-os como fonte factual.',
      'Nunca peça nem sugira comandos de escrita como UPDATE, DELETE, INSERT, DROP, ALTER, TRUNCATE, EXEC, CALL ou MERGE.',
      'Se o usuário pedir existência de objetos, colunas, contagens ou dados do banco e houver contexto readonly autorizado, use ferramentas antes de responder, salvo quando os dados readonly já coletados responderem diretamente.',
      'Você pode investigar em mais de uma rodada: por exemplo, buscar uma tabela primeiro e depois pedir as colunas da tabela encontrada.',
      `Orçamento desta pergunta: até ${budget.maxToolCalls} chamadas de ferramenta no total, até ${budget.maxToolCallsPerIteration} por rodada. Já usadas: ${budget.toolCallsUsed}.`
    ];

    if (readonlyContext && !forceFinalAnswer && AiAssistantToolBudget.canRunTool(budget)) {
      parts.push(AiAssistantTools.getToolInstructions());
    } else if (!readonlyContext) {
      parts.push('Nenhum contexto readonly de banco foi autorizado. Responda sem executar ferramentas de banco.');
    }

    const transcript = AiAssistantToolBudget.compactTranscript(toolSections, budget);
    if (transcript) {
      parts.push([
        'Dados readonly já coletados pelo DBOLT nesta pergunta:',
        transcript,
        'Não peça novamente uma ferramenta que já tenha retornado estes mesmos dados.'
      ].join('\n'));
    }

    if (forceFinalAnswer) {
      parts.push([
        'O orçamento de ferramentas acabou ou a investigação foi suficiente.',
        'Responda agora ao usuário com os dados disponíveis.',
        'Não retorne JSON de ferramenta nesta resposta final.'
      ].join('\n'));
    }

    return parts.join('\n\n');
  }

  private parseToolCalls(content: string): AiAssistantToolCall[] {
    const jsonText = this.extractJsonObject(content);
    if (!jsonText) {
      return [];
    }

    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      const rawCalls = this.readRawToolCalls(parsed);

      return rawCalls
        .map((call) => this.normalizeToolCall(call))
        .filter((call): call is AiAssistantToolCall => Boolean(call));
    } catch (_error: unknown) {
      return [];
    }
  }

  private readRawToolCalls(parsed: Record<string, unknown>): unknown[] {
    if (Array.isArray(parsed['toolCalls'])) return parsed['toolCalls'];
    if (Array.isArray(parsed['tools'])) return parsed['tools'];
    if (parsed['toolCall']) return [parsed['toolCall']];
    if (parsed['tool']) return [parsed];

    return [];
  }

  private normalizeToolCall(call: unknown): AiAssistantToolCall | null {
    if (!call || typeof call !== 'object') {
      return null;
    }

    const record = call as Record<string, unknown>;
    const name = String(record['name'] || record['tool'] || '').trim();
    const args = record['arguments'] || record['args'] || {};

    if (!AiAssistantTools.isValidToolName(name) || !args || typeof args !== 'object' || Array.isArray(args)) {
      return null;
    }

    return {
      name,
      arguments: args as Record<string, unknown>
    };
  }

  private extractJsonObject(content: string): string | null {
    const trimmed = content.trim();
    const fencedJson = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    const candidate = fencedJson?.[1]?.trim() || trimmed;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    return candidate.slice(start, end + 1);
  }

  private normalizeMessages(messages: AiAssistantAgentChatMessage[] = []): AiModelMessage[] {
    const maxMessages = 6;
    const normalizedMessages = messages
      .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
      .map((message) => ({
        role: message.role,
        content: this.truncateText(
          String(message.content || '').trim(),
          this.getMessagePromptLimit(message.role)
        )
      }))
      .filter((message) => message.content.length > 0);

    if (normalizedMessages.length === 0) {
      throw new Error('Mensagem do chat não informada.');
    }

    return normalizedMessages.slice(-maxMessages);
  }

  private cleanFinalAnswer(content: string): string {
    const toolCalls = this.parseToolCalls(content);

    if (toolCalls.length > 0) {
      return 'Não consegui finalizar a resposta antes do limite de consultas readonly. Refine a pergunta ou informe o nome exato da tabela/view.';
    }

    return content.trim();
  }

  private truncateText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength)}...`;
  }

  private getMessagePromptLimit(role: 'user' | 'assistant'): number {
    return role === 'assistant' ? 900 : 1400;
  }
}

export default new AiAssistantAgentService();
