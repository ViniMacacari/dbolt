import AiAssistantModelClient, {
  type AiModelMessage
} from './ai-assistant-model-client.js';
import AiAssistantToolBudget, {
  type AiAssistantToolBudgetState
} from './ai-assistant-tool-budget.js';
import AiAssistantTools, {
  type AiAssistantToolCall
} from './ai-assistant-tools.js';

import type { AiAssistantResolvedSettings } from './ai-assistant-settings.js';
import type { AiReadonlyDatabaseContext } from './ai-assistant-readonly-database.js';

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
    const messages = this.normalizeMessages(request.messages, settings.limits.maxContextMessages);
    const readonlyContext = request.readonlyContext?.sgbd ? request.readonlyContext : undefined;
    const responseLanguage = this.getResponseLanguage(request.appLanguage);
    const budget = AiAssistantToolBudget.createState({
      ...settings.limits,
      maxApiCallsPerMessage: readonlyContext
        ? Math.max(4, settings.limits.maxApiCallsPerMessage)
        : settings.limits.maxApiCallsPerMessage
    });
    const toolSections: string[] = [];

    let lastModel = settings.model;

    while (AiAssistantToolBudget.canCallModel(budget) && AiAssistantToolBudget.beginIteration(budget)) {
      const allowTools = Boolean(
        readonlyContext &&
        AiAssistantToolBudget.canRunTool(budget) &&
        AiAssistantToolBudget.getRemainingApiCalls(budget) > 1
      );
      const forceFinalAnswer = !allowTools && toolSections.length > 0;
      AiAssistantToolBudget.registerApiCall(budget);

      const completion = await AiAssistantModelClient.complete(
        settings,
        this.buildSystemPrompt(readonlyContext, budget, toolSections, forceFinalAnswer, responseLanguage, allowTools),
        messages
      );
      lastModel = completion.model;

      const toolCalls = allowTools
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
          `[database-action:${result.name}:${result.success ? 'ok' : 'error'}]`,
          result.content
        ].join('\n'));
      }
    }

    return {
      message: 'I could not finish the answer before the configured AI request limit. Increase the AI limits or refine the question.',
      model: lastModel
    };
  }

  private buildSystemPrompt(
    readonlyContext: AiReadonlyDatabaseContext | undefined,
    budget: AiAssistantToolBudgetState,
    toolSections: string[],
    forceFinalAnswer: boolean,
    responseLanguage: string,
    allowTools: boolean
  ): string {
    const parts = [
      'You are the AI assistant for DBOLT Database Manager.',
      `The user's selected app language is ${responseLanguage}. Write final user-facing answers in that language.`,
      'Database action JSON, action names, SQL identifiers, and database values must remain exact and must not be translated.',
      'The user may write in any language. Interpret the request semantically; do not rely on language-specific keyword matching.',
      'Focus on SQL, data modeling, schema investigation, and database productivity.',
      'Do not request passwords, tokens, or API keys.',
      'Do not invent tables, columns, or results. When read-only database action data is available, treat it as factual.',
      'Never guess column names when a read-only database context is available. If the exact columns for a table are not confirmed in the current DBOLT read-only data, request getTableColumns before writing or executing a SELECT that references columns.',
      'Distinguish SQL generation from SQL execution. You may provide DDL/DML scripts as plain text or code blocks when the user asks for them.',
      'Never execute or request DBOLT database actions for write commands such as UPDATE, DELETE, INSERT, CREATE, DROP, ALTER, TRUNCATE, EXEC, CALL, or MERGE.',
      'If you provide a write/DDL/DML script, make clear it is only a script for the user to review and run manually; do not claim it was executed.',
      'Database action and AI API call limits apply only to the current user message. They reset for every new user message and are not accumulated across the conversation.',
      ...(readonlyContext && allowTools ? [
        'When read-only context is authorized, you may execute SELECT/WITH queries with runReadonlyQuery to answer questions about database data.',
        'Do not say you cannot execute a query when the query is read-only. Use runReadonlyQuery instead of giving SQL for the user to run, unless the user only asks for the query text.',
        'If the user asks about object existence, columns, counts, IDs, or database data and read-only context is authorized, use database actions before answering, unless already collected read-only data answers directly.',
        'For questions that require sequential investigation, continue using database actions until you find the answer or the budget is exhausted. Example: search for the table, inspect columns, run a filtered SELECT, then answer.',
        'You can investigate across multiple rounds. For example, search for a table first, then request columns for the table you found.',
        'If a runReadonlyQuery action fails because a column or table is invalid, do not stop with a manual SQL example. Request getTableColumns or searchObjects next, then retry with exact metadata names.',
        'When the user asks for actual database data, answer from runReadonlyQuery results. Do not provide only an example script while read-only actions are still available.'
      ] : []),
      ...this.getDialectPromptRules(readonlyContext),
      `Current user message budget: up to ${budget.maxApiCallsPerMessage} AI API calls and up to ${budget.maxToolCalls} database actions, up to ${budget.maxToolCallsPerIteration} database actions per AI API call.`,
      `Already used for this current user message before this AI API call: ${Math.max(0, budget.apiCallsUsed - 1)} AI API calls and ${budget.toolCallsUsed} database actions.`
    ];

    if (allowTools && !forceFinalAnswer) {
      parts.push(AiAssistantTools.getToolInstructions());
    } else if (!readonlyContext) {
      parts.push('No read-only database context was authorized. Answer without running database actions.');
    } else if (!allowTools) {
      parts.push('Do not request database actions in this response. Answer with the data already available.');
    }

    const transcript = AiAssistantToolBudget.compactTranscript(toolSections, budget);
    if (transcript) {
      parts.push([
        'Read-only data already collected by DBOLT for this question:',
        transcript,
        'Do not request the same database action again if it has already returned the same data.'
      ].join('\n'));
    }

    if (forceFinalAnswer) {
      parts.push([
        'The database action budget is exhausted or the investigation is sufficient.',
        'Answer the user now with the available data.',
        'Do not return database action JSON in this final answer.'
      ].join('\n'));
    }

    return parts.join('\n\n');
  }

  private getDialectPromptRules(readonlyContext: AiReadonlyDatabaseContext | undefined): string[] {
    const database = String(readonlyContext?.sgbd || '').toLowerCase();

    if (database !== 'hana') {
      return [];
    }

    return [
      'SAP HANA dialect rule: use double quotes around table and column identifiers using the exact case returned by metadata, especially mixed-case SAP Business One columns such as "DocEntry" and "DocDate".',
      'SAP HANA uppercases unquoted identifiers, so DocEntry without quotes becomes DOCENTRY and can fail. Do not use brackets or backticks for HANA identifiers.',
      'SAP HANA example shape after columns are confirmed: SELECT TOP 1 "DocEntry", "DocDate" FROM "OINV" ORDER BY "DocEntry" DESC.'
    ];
  }

  private parseToolCalls(content: string): AiAssistantToolCall[] {
    const jsonTexts = this.extractJsonValues(content);
    if (jsonTexts.length === 0) {
      return [];
    }

    const toolCalls: AiAssistantToolCall[] = [];
    const seenCalls = new Set<string>();

    for (const jsonText of jsonTexts) {
      try {
        const parsed = JSON.parse(jsonText) as unknown;
        const rawCalls = this.readRawToolCalls(parsed);

        for (const rawCall of rawCalls) {
          const toolCall = this.normalizeToolCall(rawCall);
          if (!toolCall) continue;

          const key = JSON.stringify(toolCall);
          if (seenCalls.has(key)) continue;

          seenCalls.add(key);
          toolCalls.push(toolCall);
        }
      } catch (_error: unknown) {
        continue;
      }
    }

    return toolCalls;
  }

  private readRawToolCalls(parsed: unknown): unknown[] {
    if (Array.isArray(parsed)) {
      return parsed.flatMap((item) => this.readRawToolCalls(item));
    }

    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    const record = parsed as Record<string, unknown>;

    for (const key of ['databaseActions', 'actions', 'toolCalls', 'tools']) {
      if (key in record) {
        return this.readRawToolCallList(record[key]);
      }
    }

    if ('action' in record) {
      return typeof record['action'] === 'string'
        ? [record]
        : this.readRawToolCallList(record['action']);
    }

    for (const key of ['databaseAction', 'toolCall']) {
      if (key in record) {
        return this.readRawToolCallList(record[key]);
      }
    }

    if (this.normalizeToolName(record['name']) || this.normalizeToolName(record['tool'])) {
      return [record];
    }

    const directToolEntry = this.readDirectToolEntry(record);
    if (directToolEntry) {
      return [{
        name: directToolEntry.name,
        arguments: record[directToolEntry.key]
      }];
    }

    if ('tool' in record) {
      return [record];
    }

    return [];
  }

  private normalizeToolCall(call: unknown): AiAssistantToolCall | null {
    if (!call || typeof call !== 'object') {
      return null;
    }

    const record = call as Record<string, unknown>;
    const directToolEntry = this.readDirectToolEntry(record);
    const name = this.normalizeToolName(record['name'])
      || this.normalizeToolName(record['tool'])
      || this.normalizeToolName(record['action'])
      || directToolEntry?.name
      || '';
    const args = directToolEntry
      ? this.normalizeToolArguments(directToolEntry.name, record[directToolEntry.key], record)
      : this.normalizeToolArguments(name, record['arguments'] ?? record['args'] ?? record['parameters'] ?? record['input'], record);

    if (!name || !AiAssistantTools.isValidToolName(name)) {
      return null;
    }

    return {
      name,
      arguments: args
    };
  }

  private readRawToolCallList(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [value];
  }

  private normalizeToolName(value: unknown): AiAssistantToolCall['name'] | '' {
    if (typeof value !== 'string') {
      return '';
    }

    const normalized = value.trim().replace(/[\s_-]+/g, '').toLowerCase();

    if (normalized === 'searchobjects' || normalized === 'searchobject' || normalized === 'findobjects') {
      return 'searchObjects';
    }

    if (normalized === 'gettablecolumns' || normalized === 'tablecolumns' || normalized === 'columns') {
      return 'getTableColumns';
    }

    if (normalized === 'getschemasummary' || normalized === 'schemasummary') {
      return 'getSchemaSummary';
    }

    if (
      normalized === 'runreadonlyquery' ||
      normalized === 'runreadonlysql' ||
      normalized === 'readonlyquery' ||
      normalized === 'readonlysql' ||
      normalized === 'query'
    ) {
      return 'runReadonlyQuery';
    }

    return '';
  }

  private normalizeDirectToolKey(value: string): AiAssistantToolCall['name'] | '' {
    const normalized = value.trim().replace(/[\s_-]+/g, '').toLowerCase();

    if (normalized === 'searchobjects' || normalized === 'searchobject') {
      return 'searchObjects';
    }

    if (normalized === 'gettablecolumns' || normalized === 'tablecolumns') {
      return 'getTableColumns';
    }

    if (normalized === 'getschemasummary' || normalized === 'schemasummary') {
      return 'getSchemaSummary';
    }

    if (
      normalized === 'runreadonlyquery' ||
      normalized === 'runreadonlysql' ||
      normalized === 'readonlyquery' ||
      normalized === 'readonlysql'
    ) {
      return 'runReadonlyQuery';
    }

    return '';
  }

  private readDirectToolEntry(record: Record<string, unknown>): { key: string; name: AiAssistantToolCall['name'] } | null {
    for (const key of Object.keys(record)) {
      const toolName = this.normalizeDirectToolKey(key);
      if (toolName) {
        return { key, name: toolName };
      }
    }

    return null;
  }

  private normalizeToolArguments(
    toolName: AiAssistantToolCall['name'] | '',
    value: unknown,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const parsedValue = this.parseToolArgumentsValue(value);
    const args = parsedValue || this.readInlineToolArguments(source);

    if (!toolName) {
      return args;
    }

    return this.normalizeToolArgumentAliases(toolName, args);
  }

  private parseToolArgumentsValue(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch (_error: unknown) {
      return null;
    }
  }

  private readInlineToolArguments(source: Record<string, unknown>): Record<string, unknown> {
    const reservedKeys = new Set([
      'name',
      'tool',
      'arguments',
      'args',
      'parameters',
      'input',
      'databaseActions',
      'databaseAction',
      'actions',
      'action',
      'toolCalls',
      'toolCall',
      'tools'
    ]);
    const args: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(source)) {
      if (!reservedKeys.has(key) && !this.normalizeDirectToolKey(key)) {
        args[key] = value;
      }
    }

    return args;
  }

  private normalizeToolArgumentAliases(
    toolName: AiAssistantToolCall['name'],
    args: Record<string, unknown>
  ): Record<string, unknown> {
    const normalizedArgs = { ...args };

    if (toolName === 'searchObjects' && typeof normalizedArgs['search'] !== 'string') {
      normalizedArgs['search'] = normalizedArgs['query'] || normalizedArgs['term'] || normalizedArgs['text'] || '';
    }

    if (toolName === 'getTableColumns' && typeof normalizedArgs['tableName'] !== 'string') {
      normalizedArgs['tableName'] = normalizedArgs['table'] || normalizedArgs['table_name'] || normalizedArgs['name'] || '';
    }

    if (toolName === 'runReadonlyQuery') {
      if (typeof normalizedArgs['sql'] !== 'string') {
        normalizedArgs['sql'] = normalizedArgs['query'] || normalizedArgs['statement'] || '';
      }

      if (normalizedArgs['maxRows'] === undefined) {
        normalizedArgs['maxRows'] = normalizedArgs['limit'] || normalizedArgs['rows'];
      }
    }

    return normalizedArgs;
  }

  private extractJsonValues(content: string): string[] {
    const trimmed = content.trim();
    const fencedJson = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    const candidate = fencedJson?.[1]?.trim() || trimmed;
    const values: string[] = [];
    let start = -1;
    let closers: string[] = [];
    let inString = false;
    let escaping = false;

    for (let index = 0; index < candidate.length; index++) {
      const char = candidate[index];

      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === '\\' && inString) {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{' || char === '[') {
        if (closers.length === 0) {
          start = index;
        }

        closers.push(char === '{' ? '}' : ']');
        continue;
      }

      if ((char === '}' || char === ']') && closers.length > 0) {
        const expectedCloser = closers[closers.length - 1];

        if (char !== expectedCloser) {
          closers = [];
          start = -1;
          continue;
        }

        closers.pop();

        if (closers.length === 0 && start >= 0) {
          values.push(candidate.slice(start, index + 1));
          start = -1;
        }
      }
    }

    return values;
  }

  private normalizeMessages(messages: AiAssistantAgentChatMessage[] = [], maxMessages = 10): AiModelMessage[] {
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
