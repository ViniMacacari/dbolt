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
  appLanguage?: string;
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
    const responseLanguage = this.getResponseLanguage(request.appLanguage);
    const budget = AiAssistantToolBudget.createState();
    const toolSections: string[] = [];
    const preloadedContext = await this.buildPreloadedContext(readonlyContext, messages);

    if (preloadedContext) {
      toolSections.push(`[preloaded-readonly-context]\n${preloadedContext}`);
    }

    let lastModel = settings.model;

    while (AiAssistantToolBudget.beginIteration(budget)) {
      const completion = await AiAssistantModelClient.complete(
        settings,
        this.buildSystemPrompt(readonlyContext, budget, toolSections, false, responseLanguage),
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
          message: 'No read-only database context was authorized for query execution.',
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
          `[tool:${result.name}:${result.success ? 'ok' : 'error'}]`,
          result.content
        ].join('\n'));
      }
    }

    const finalCompletion = await AiAssistantModelClient.complete(
      settings,
      this.buildSystemPrompt(readonlyContext, budget, toolSections, true, responseLanguage),
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
    forceFinalAnswer: boolean,
    responseLanguage: string
  ): string {
    const parts = [
      'You are the AI assistant for DBOLT Database Manager.',
      `The user's selected app language is ${responseLanguage}. Write final user-facing answers in that language.`,
      'Tool-call JSON, tool names, SQL identifiers, and database values must remain exact and must not be translated.',
      'Focus on SQL, data modeling, schema investigation, and database productivity.',
      'Do not request passwords, tokens, or API keys.',
      'Do not invent tables, columns, or results. When read-only tool data is available, treat it as factual.',
      'Never request or suggest write commands such as UPDATE, DELETE, INSERT, DROP, ALTER, TRUNCATE, EXEC, CALL, or MERGE.',
      'When read-only context is authorized, you may execute SELECT/WITH queries with runReadonlyQuery to answer questions about database data.',
      'Do not say you cannot execute a query when the query is read-only. Use runReadonlyQuery instead of giving SQL for the user to run, unless the user only asks for the query text.',
      'If the user asks about object existence, columns, counts, IDs, or database data and read-only context is authorized, use tools before answering, unless already collected read-only data answers directly.',
      'For questions that require sequential investigation, continue using tools until you find the answer or the budget is exhausted. Example: search for the table, inspect columns, run a filtered SELECT, then answer.',
      'You can investigate across multiple rounds. For example, search for a table first, then request columns for the table you found.',
      `Budget for this question: up to ${budget.maxToolCalls} total tool calls, up to ${budget.maxToolCallsPerIteration} per round. Already used: ${budget.toolCallsUsed}.`
    ];

    if (readonlyContext && !forceFinalAnswer && AiAssistantToolBudget.canRunTool(budget)) {
      parts.push(AiAssistantTools.getToolInstructions());
    } else if (!readonlyContext) {
      parts.push('No read-only database context was authorized. Answer without running database tools.');
    }

    const transcript = AiAssistantToolBudget.compactTranscript(toolSections, budget);
    if (transcript) {
      parts.push([
        'Read-only data already collected by DBOLT for this question:',
        transcript,
        'Do not request a tool again if it has already returned the same data.'
      ].join('\n'));
    }

    if (forceFinalAnswer) {
      parts.push([
        'The tool budget is exhausted or the investigation is sufficient.',
        'Answer the user now with the available data.',
        'Do not return tool JSON in this final answer.'
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
      throw new Error('Chat message was not provided.');
    }

    return normalizedMessages.slice(-maxMessages);
  }

  private cleanFinalAnswer(content: string): string {
    const toolCalls = this.parseToolCalls(content);

    if (toolCalls.length > 0) {
      return 'I could not finish the answer before the read-only query limit. Refine the question or provide the exact table/view name.';
    }

    return content.trim();
  }

  private getResponseLanguage(appLanguage: unknown): string {
    return appLanguage === 'pt-BR' ? 'Brazilian Portuguese (pt-BR)' : 'English (en)';
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
