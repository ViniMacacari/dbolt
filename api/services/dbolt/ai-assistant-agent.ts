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
    const readonlyContext = this.normalizeReadonlyContext(request.readonlyContext);
    const responseLanguage = this.getResponseLanguage(request.appLanguage);
    const budget = AiAssistantToolBudget.createState({
      ...settings.limits,
      maxApiCallsPerMessage: readonlyContext
        ? Math.max(6, settings.limits.maxApiCallsPerMessage)
        : settings.limits.maxApiCallsPerMessage,
      maxDatabaseRequestsPerMessage: readonlyContext
        ? Math.max(10, settings.limits.maxDatabaseRequestsPerMessage)
        : settings.limits.maxDatabaseRequestsPerMessage,
      maxDatabaseRequestsPerApiCall: readonlyContext
        ? Math.max(3, settings.limits.maxDatabaseRequestsPerApiCall)
        : settings.limits.maxDatabaseRequestsPerApiCall
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

      const toolCalls = this.parseToolCalls(completion.content);

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

      if (!await this.executeToolCalls(readonlyContext, budget, toolSections, toolCalls)) {
        break;
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
      'Column names must never be inferred, assumed, hallucinated, approximated, or guessed. A column name is valid only if it was explicitly returned by DBOLT read-only metadata during the current conversation. Before generating, validating, or executing any SELECT statement, you MUST verify that every referenced column was explicitly confirmed through getTableColumns or other DBOLT read-only results. If any referenced column has not been explicitly confirmed, you MUST request getTableColumns before proceeding. Do not rely on naming conventions, semantic similarity, prior experience, common schemas, or probabilistic assumptions. Using unverified column names is a policy violation.',
      'Never guess column names when a read-only database context is available. If the exact columns for a table are not confirmed in the current DBOLT read-only data, request getTableColumns before writing or executing a SELECT that references columns.',
      'Distinguish SQL generation from SQL execution. You may provide DDL/DML scripts as plain text or code blocks when the user asks for them.',
      'Never execute or request DBOLT database actions for write commands such as UPDATE, DELETE, INSERT, CREATE, DROP, ALTER, TRUNCATE, EXEC, CALL, or MERGE.',
      'If you provide a write/DDL/DML script, make clear it is only a script for the user to review and run manually; do not claim it was executed.',
      'Database action and AI API call limits apply only to the current user message. They reset for every new user message and are not accumulated across the conversation.',
      'Only say the current message limit is exhausted when DBOLT explicitly stops allowing database actions in this current request.',
      ...(readonlyContext && allowTools ? [
        this.buildReadonlyContextPrompt(readonlyContext),
        'Read-only database context is already authorized for this message. Read-only means DBOLT will not modify data; it does not mean you are forbidden from reading table rows.',
        'You may consult any database data needed by executing SELECT/WITH queries with runReadonlyQuery.',
        'When the user asks to search, consult, show, verify, find, list actual rows, or answer a question about current database data, request databaseActions JSON and run SELECT/WITH queries through runReadonlyQuery.',
        'When a database action is needed, do not answer with prose or a SQL code block. Reply only with databaseActions JSON so DBOLT can execute the read-only action.',
        'If the user asks only for SQL/query/script/SELECT text, provide the SQL text and do not execute it.',
        'Do not say you cannot query the database when the query is read-only. Do not tell the user to run a SELECT manually while runReadonlyQuery is available, unless the user only asks for query text.',
        'If the user asks about object existence, columns, counts, IDs, or database data and read-only context is authorized, use database actions before answering, unless already collected read-only data answers directly.',
        'Use only these exact database action names: searchObjects, getTableColumns, getSchemaSummary, runReadonlyQuery.',
        'To list tables or views, use getSchemaSummary. Do not invent action names such as listTables or showTables.',
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
        'The text above is DBOLT execution output, not a request syntax. To request more database actions, use only the databaseActions JSON format from the tool instructions.',
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

  private normalizeReadonlyContext(context: AiReadonlyDatabaseContext | undefined): AiReadonlyDatabaseContext | undefined {
    if (!context) {
      return undefined;
    }

    const inferredSgbd = this.normalizeSupportedDatabaseName(context.sgbd)
      || this.normalizeSupportedDatabaseName(context.database);

    if (!inferredSgbd) {
      return undefined;
    }

    return {
      ...context,
      sgbd: inferredSgbd
    };
  }

  private async executeToolCalls(
    readonlyContext: AiReadonlyDatabaseContext,
    budget: AiAssistantToolBudgetState,
    toolSections: string[],
    toolCalls: AiAssistantToolCall[]
  ): Promise<boolean> {
    const executableCalls = toolCalls.slice(
      0,
      Math.min(budget.maxToolCallsPerIteration, AiAssistantToolBudget.getRemainingToolCalls(budget))
    );

    if (executableCalls.length === 0 || !AiAssistantToolBudget.canRunTool(budget)) {
      return false;
    }

    for (const toolCall of executableCalls) {
      AiAssistantToolBudget.registerToolCall(budget);
      const result = await AiAssistantTools.execute(readonlyContext, toolCall, budget);
      toolSections.push([
        `DBOLT read-only result. Executed action: ${result.name}. Status: ${result.success ? 'ok' : 'error'}.`,
        result.content
      ].join('\n'));
    }

    return true;
  }

  private normalizeSupportedDatabaseName(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === 'postgres' || normalized === 'postgresql') {
      return 'postgres';
    }

    if (normalized === 'mysql') {
      return 'mysql';
    }

    if (normalized === 'hana' || normalized === 'sap hana') {
      return 'hana';
    }

    if (normalized === 'sqlserver' || normalized === 'sql server' || normalized === 'mssql') {
      return 'sqlserver';
    }

    if (normalized === 'sqlite') {
      return 'sqlite';
    }

    return '';
  }

  private buildReadonlyContextPrompt(readonlyContext: AiReadonlyDatabaseContext): string {
    const contextItems = [
      ['Connection name', readonlyContext.connectionName],
      ['Database engine/type', readonlyContext.sgbd],
      ['Database version', readonlyContext.version]
    ]
      .filter((item): item is [string, string] => typeof item[1] === 'string' && item[1].trim().length > 0)
      .map(([label, value]) => `- ${label}: ${value}`);

    return [
      'Current DBOLT read-only database context visible to you:',
      ...(contextItems.length ? contextItems : ['- No public connection metadata was provided.']),
      'The internal connectionKey is intentionally not shown to you.'
    ].join('\n');
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
    const toolCalls: AiAssistantToolCall[] = [];
    const seenCalls = new Set<string>();
    const addToolCall = (rawCall: unknown): void => {
      const toolCall = this.normalizeToolCall(rawCall);
      if (!toolCall) return;

      const key = JSON.stringify(toolCall);
      if (seenCalls.has(key)) return;

      seenCalls.add(key);
      toolCalls.push(toolCall);
    };

    for (const jsonText of jsonTexts) {
      try {
        const parsed = this.parseJsonValue(jsonText);
        if (parsed === null) {
          continue;
        }

        const rawCalls = this.readRawToolCalls(parsed);
        rawCalls.forEach(addToolCall);
      } catch (_error: unknown) {
        continue;
      }
    }

    this.readLegacyBracketToolCalls(content).forEach(addToolCall);

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

  private parseJsonValue(jsonText: string): unknown | null {
    const candidates = [
      jsonText,
      this.escapeJsonControlCharactersInStrings(jsonText),
      this.repairLooseDatabaseActionJson(jsonText),
      this.escapeJsonControlCharactersInStrings(this.repairLooseDatabaseActionJson(jsonText))
    ];
    const seenCandidates = new Set<string>();

    for (const candidate of candidates) {
      if (seenCandidates.has(candidate)) {
        continue;
      }

      seenCandidates.add(candidate);

      try {
        return JSON.parse(candidate) as unknown;
      } catch (_error: unknown) {
        continue;
      }
    }

    return null;
  }

  private repairLooseDatabaseActionJson(value: string): string {
    const knownKeys = new Set([
      'databaseActions',
      'databaseAction',
      'actions',
      'action',
      'toolCalls',
      'toolCall',
      'tools',
      'name',
      'tool',
      'arguments',
      'args',
      'parameters',
      'input',
      'search',
      'query',
      'term',
      'text',
      'types',
      'limit',
      'tableName',
      'table',
      'table_name',
      'sql',
      'statement',
      'maxRows',
      'rows'
    ]);
    let result = '';
    let inString = false;
    let escaping = false;
    let index = 0;

    while (index < value.length) {
      const char = value[index];

      if (escaping) {
        result += char;
        escaping = false;
        index++;
        continue;
      }

      if (char === '\\' && inString) {
        result += char;
        escaping = true;
        index++;
        continue;
      }

      if (char === '"') {
        result += char;
        inString = !inString;
        index++;
        continue;
      }

      if (inString || (char !== '{' && char !== ',')) {
        result += char;
        index++;
        continue;
      }

      result += char;
      index++;

      const whitespaceStart = index;
      while (index < value.length && /\s/.test(value[index])) {
        result += value[index];
        index++;
      }

      const keyStart = index;
      if (!/[A-Za-z_]/.test(value[keyStart] || '')) {
        continue;
      }

      while (index < value.length && /[A-Za-z0-9_]/.test(value[index])) {
        index++;
      }

      const key = value.slice(keyStart, index);
      let lookahead = index;

      if (value[lookahead] === '"') {
        lookahead++;
      }

      while (lookahead < value.length && /\s/.test(value[lookahead])) {
        lookahead++;
      }

      if (knownKeys.has(key) && value[lookahead] === ':') {
        result += `"${key}"`;
        if (value[index] === '"') {
          index++;
        }
        continue;
      }

      result += value.slice(keyStart, index);
    }

    return result;
  }

  private escapeJsonControlCharactersInStrings(value: string): string {
    let result = '';
    let inString = false;
    let escaping = false;

    for (let index = 0; index < value.length; index++) {
      const char = value[index];

      if (escaping) {
        result += char;
        escaping = false;
        continue;
      }

      if (char === '\\' && inString) {
        result += char;
        escaping = true;
        continue;
      }

      if (char === '"') {
        result += char;
        inString = !inString;
        continue;
      }

      if (inString && char === '\n') {
        result += '\\n';
        continue;
      }

      if (inString && char === '\r') {
        result += '\\r';
        continue;
      }

      if (inString && char === '\t') {
        result += '\\t';
        continue;
      }

      result += char;
    }

    return result;
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

    if (
      normalized === 'gettablecolumns' ||
      normalized === 'tablecolumns' ||
      normalized === 'columns' ||
      normalized === 'getcolumns' ||
      normalized === 'listcolumns' ||
      normalized === 'showcolumns' ||
      normalized === 'describetable' ||
      normalized === 'describe'
    ) {
      return 'getTableColumns';
    }

    if (
      normalized === 'getschemasummary' ||
      normalized === 'schemasummary' ||
      normalized === 'listtables' ||
      normalized === 'showtables' ||
      normalized === 'gettables' ||
      normalized === 'tables' ||
      normalized === 'listviews' ||
      normalized === 'showviews' ||
      normalized === 'getviews' ||
      normalized === 'views' ||
      normalized === 'listobjects' ||
      normalized === 'showobjects' ||
      normalized === 'listdatabaseobjects' ||
      normalized === 'listschema' ||
      normalized === 'schema'
    ) {
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

    if (
      normalized === 'gettablecolumns' ||
      normalized === 'tablecolumns' ||
      normalized === 'getcolumns' ||
      normalized === 'listcolumns' ||
      normalized === 'showcolumns' ||
      normalized === 'describetable'
    ) {
      return 'getTableColumns';
    }

    if (
      normalized === 'getschemasummary' ||
      normalized === 'schemasummary' ||
      normalized === 'listtables' ||
      normalized === 'showtables' ||
      normalized === 'gettables' ||
      normalized === 'tables' ||
      normalized === 'listviews' ||
      normalized === 'showviews' ||
      normalized === 'getviews' ||
      normalized === 'views' ||
      normalized === 'listobjects' ||
      normalized === 'showobjects' ||
      normalized === 'listdatabaseobjects' ||
      normalized === 'listschema' ||
      normalized === 'schema'
    ) {
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

    if (toolName === 'searchObjects' && typeof normalizedArgs['types'] === 'string') {
      normalizedArgs['types'] = normalizedArgs['types']
        .split(',')
        .map((type) => type.trim())
        .filter(Boolean);
    }

    if (toolName === 'getTableColumns' && typeof normalizedArgs['tableName'] !== 'string') {
      normalizedArgs['tableName'] = normalizedArgs['table'] || normalizedArgs['table_name'] || normalizedArgs['name'] || '';
    }

    if (toolName === 'getSchemaSummary' && typeof normalizedArgs['search'] !== 'string') {
      normalizedArgs['search'] = normalizedArgs['query'] || normalizedArgs['term'] || normalizedArgs['text'] || '';
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

  private readLegacyBracketToolCalls(content: string): unknown[] {
    const calls: unknown[] = [];
    const pattern = /\[\s*(?:database-action|databaseAction|dbolt-action)\s*:\s*([A-Za-z_][\w-]*)\s*(?::\s*([^\]]*))?\]/g;

    for (const match of content.matchAll(pattern)) {
      const name = this.normalizeToolName(match[1]);
      if (!name) continue;

      calls.push({
        name,
        arguments: this.readLegacyBracketArguments(name, match[2] || '')
      });
    }

    return calls;
  }

  private readLegacyBracketArguments(
    toolName: AiAssistantToolCall['name'],
    value: string
  ): Record<string, unknown> {
    const trimmed = value.trim();

    if (!trimmed) {
      return {};
    }

    const args: Record<string, unknown> = {};
    const pairPattern = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;,]+))/g;

    for (const match of trimmed.matchAll(pairPattern)) {
      args[match[1]] = this.normalizeLegacyBracketValue(match[2] ?? match[3] ?? match[4] ?? '');
    }

    if (Object.keys(args).length === 0) {
      args[this.getDefaultArgumentName(toolName)] = trimmed;
    }

    return this.normalizeToolArgumentAliases(toolName, args);
  }

  private normalizeLegacyBracketValue(value: string): unknown {
    const trimmed = value.trim();

    if (/^-?\d+$/.test(trimmed)) {
      return Number(trimmed);
    }

    if (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
      try {
        return JSON.parse(trimmed) as unknown;
      } catch (_error: unknown) {
        return trimmed;
      }
    }

    return trimmed;
  }

  private getDefaultArgumentName(toolName: AiAssistantToolCall['name']): string {
    if (toolName === 'searchObjects') {
      return 'search';
    }

    if (toolName === 'getTableColumns') {
      return 'tableName';
    }

    if (toolName === 'runReadonlyQuery') {
      return 'sql';
    }

    return 'search';
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
          this.sanitizeConversationMessage(message.role, String(message.content || '').trim()),
          this.getMessagePromptLimit(message.role)
        )
      }))
      .filter((message) => message.content.length > 0);

    if (normalizedMessages.length === 0) {
      throw new Error('Chat message was not provided.');
    }

    return normalizedMessages.slice(-maxMessages);
  }

  private sanitizeConversationMessage(role: 'user' | 'assistant', content: string): string {
    if (role === 'user') {
      return content;
    }

    if (this.isAssistantToolRequestOnly(content)) {
      return '';
    }

    return this.removeToolCallSyntax(content).trim();
  }

  private isAssistantToolRequestOnly(content: string): boolean {
    const normalized = content.trim();

    if (!normalized) {
      return true;
    }

    return this.parseToolCalls(normalized).length > 0 &&
      this.removeToolCallSyntax(normalized).trim().length === 0;
  }

  private removeToolCallSyntax(content: string): string {
    let result = content;

    for (const jsonText of this.extractJsonValues(content)) {
      const parsed = this.parseJsonValue(jsonText);
      if (parsed === null) {
        continue;
      }

      if (this.readRawToolCalls(parsed).length > 0) {
        result = result.replace(jsonText, '');
      }
    }

    return result.replace(
      /\[\s*(?:database-action|databaseAction|dbolt-action)\s*:\s*([A-Za-z_][\w-]*)\s*(?::\s*([^\]]*))?\]/g,
      ''
    );
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
