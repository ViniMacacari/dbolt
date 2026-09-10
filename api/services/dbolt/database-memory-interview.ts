import AiAssistantModelClient, {
  type AiModelMessage,
  type AiModelSystemPrompt
} from './ai-assistant-model-client.js';
import AiAssistantSchemaMemory from './ai-assistant-schema-memory.js';
import AiAssistantSettings from './ai-assistant-settings.js';
import AiAssistantToolBudget from './ai-assistant-tool-budget.js';
import AiAssistantTools from './ai-assistant-tools.js';
import DatabaseMemory from './database-memory.js';
import DatabaseMemoryStorage, {
  MAX_NOTE_TEXT_CHARS,
  MAX_NOTE_TOPIC_CHARS,
  type DatabaseMemoryScope
} from '../../utils/database-memory-storage.js';

import type { AiReadonlyDatabaseContext } from './ai-assistant-readonly-database.js';

const MAX_MODEL_CALLS_PER_TURN = 6;
const MAX_TABLES_PER_TURN = 8;
const MAX_QUERIES_PER_TURN = 4;
const MAX_PROPOSED_NOTES = 8;
const MAX_QUESTIONS = 5;
const MAX_FOUNDATION_NOTES = 2;
const TURN_STATE_SEPARATOR = String.fromCharCode(10) + String.fromCharCode(10);
const MAX_CONTEXT_MESSAGES = 8;
const MAX_MESSAGE_CHARS = 2000;
const MAX_INVESTIGATION_CHARS = 45000;
const SCHEMA_SUMMARY_LIMIT = 1500;
const INTERVIEW_TOOL_RESULT_CHARS = 50000;

export interface DatabaseMemoryInterviewMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type DatabaseMemoryInterviewMode = 'investigate' | 'instruct';

export interface DatabaseMemoryInterviewRequest {
  scope: DatabaseMemoryScope;
  readonlyContext?: AiReadonlyDatabaseContext;
  messages?: DatabaseMemoryInterviewMessage[];
  mode?: DatabaseMemoryInterviewMode;
  appLanguage?: string;
}

export interface DatabaseMemoryProposedNote {
  topic: string;
  text: string;
}

export interface DatabaseMemoryInterviewResult {
  message: string;
  questions: string[];
  proposedNotes: DatabaseMemoryProposedNote[];
  inspectedTables: string[];
  executedQueries: string[];
  model: string;
}

class DatabaseMemoryInterviewService {
  async run(request: DatabaseMemoryInterviewRequest): Promise<DatabaseMemoryInterviewResult> {
    const settings = await AiAssistantSettings.getResolvedSettings();
    const scope = request.scope || {};
    const mode: DatabaseMemoryInterviewMode = request.mode === 'instruct' ? 'instruct' : 'investigate';
    const messages = this.normalizeMessages(request.messages);
    const responseLanguage = request.appLanguage === 'pt-BR'
      ? 'Brazilian Portuguese (pt-BR)'
      : 'English (en)';
    const savedNotes = await DatabaseMemory.get(scope).catch(() => null);
    let foundationComplete = false;
    const investigation: string[] = [];
    const inspectedTables: string[] = [];
    const executedQueries: string[] = [];

    if (request.readonlyContext && mode === 'investigate') {
      investigation.push(await this.readSchemaSummary(request.readonlyContext));
    }

    let correction = '';
    let lastModel = settings.model;
    let result: DatabaseMemoryInterviewResult | null = null;

    for (let call = 0; call < MAX_MODEL_CALLS_PER_TURN; call++) {
      const investigationPossible = Boolean(request.readonlyContext)
        && call + 1 < MAX_MODEL_CALLS_PER_TURN
        && (inspectedTables.length < MAX_TABLES_PER_TURN || executedQueries.length < MAX_QUERIES_PER_TURN);
      const canInvestigateAgain = investigationPossible && foundationComplete;
      const completion = await AiAssistantModelClient.complete(
        settings,
        this.buildPrompt(
          scope,
          responseLanguage,
          savedNotes ? this.renderSavedNotes(savedNotes.notes) : '',
          investigation,
          canInvestigateAgain,
          MAX_TABLES_PER_TURN - inspectedTables.length,
          MAX_QUERIES_PER_TURN - executedQueries.length,
          mode,
          foundationComplete,
          correction
        ),
        messages
      );
      lastModel = completion.model;
      const parsed = this.parseCompletion(completion.content);
      const verdict = this.readFoundationVerdict(parsed);

      if (verdict !== null) {
        foundationComplete = verdict;
      }

      const requested = canInvestigateAgain
        ? this.readInvestigationRequest(parsed, inspectedTables, executedQueries)
        : { tables: [], queries: [] };

      if (requested.tables.length > 0 || requested.queries.length > 0) {
        for (const tableName of requested.tables) {
          inspectedTables.push(tableName);
          investigation.push(await this.readTableColumns(request.readonlyContext as AiReadonlyDatabaseContext, tableName));
        }

        for (const sql of requested.queries) {
          executedQueries.push(sql);
          investigation.push(await this.runReadonlyQuery(request.readonlyContext as AiReadonlyDatabaseContext, sql));
        }

        continue;
      }

      const message = this.normalizeText(parsed['message'], 4000);
      const questions = this.normalizeQuestions(parsed);
      const proposedNotes = this.limitNotesForTurn(
        this.normalizeProposedNotes(parsed['notes']),
        foundationComplete
      );
      const unusable = questions.length === 0 && proposedNotes.length === 0 && !message;
      const missingQuestions = !foundationComplete && questions.length === 0;
      const missingVerdict = verdict === null;

      if ((unusable || missingQuestions || missingVerdict) && call + 1 < MAX_MODEL_CALLS_PER_TURN) {
        correction = this.buildCorrection(foundationComplete, missingVerdict);
        continue;
      }

      if (foundationComplete && investigationPossible && inspectedTables.length === 0 && executedQueries.length === 0) {
        correction = this.buildInvestigationNudge();
        continue;
      }

      result = {
        message: message || (questions.length || proposedNotes.length
          ? ''
          : this.buildEmptyTurnMessage(responseLanguage)),
        questions,
        proposedNotes,
        inspectedTables,
        executedQueries,
        model: lastModel
      };
      break;
    }

    if (!result) {
      return {
        message: '',
        questions: [],
        proposedNotes: [],
        inspectedTables,
        executedQueries,
        model: lastModel
      };
    }

    return result;
  }

  private readInvestigationRequest(
    parsed: Record<string, unknown>,
    inspectedTables: string[],
    executedQueries: string[]
  ): { tables: string[]; queries: string[] } {
    const raw = parsed['investigate'];
    const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const legacyTable = this.normalizeText(parsed['inspectTable'], 128);
    const tableCandidates = [
      ...(Array.isArray(record['tables']) ? record['tables'] : []),
      ...(legacyTable ? [legacyTable] : [])
    ];
    const tables: string[] = [];
    const queries: string[] = [];

    for (const candidate of tableCandidates) {
      const tableName = this.normalizeText(candidate, 128);

      if (
        tableName &&
        !inspectedTables.includes(tableName) &&
        !tables.includes(tableName) &&
        inspectedTables.length + tables.length < MAX_TABLES_PER_TURN
      ) {
        tables.push(tableName);
      }
    }

    for (const candidate of (Array.isArray(record['queries']) ? record['queries'] : [])) {
      const sql = this.normalizeText(candidate, 600);

      if (
        sql &&
        !executedQueries.includes(sql) &&
        !queries.includes(sql) &&
        executedQueries.length + queries.length < MAX_QUERIES_PER_TURN
      ) {
        queries.push(sql);
      }
    }

    return { tables, queries };
  }

  private async runReadonlyQuery(
    context: AiReadonlyDatabaseContext,
    sql: string
  ): Promise<string> {
    const budget = AiAssistantToolBudget.createState({});
    const result = await AiAssistantTools.execute(
      context,
      { name: 'runReadonlyQuery', arguments: { sql, maxRows: 20 } },
      budget
    );

    return `Read-only query (status ${result.success ? 'ok' : 'error'}):
${sql}
${result.content}`;
  }

  private buildPrompt(
    scope: DatabaseMemoryScope,
    responseLanguage: string,
    savedNotes: string,
    investigation: string[],
    canInvestigateAgain: boolean,
    remainingTables: number,
    remainingQueries: number,
    mode: DatabaseMemoryInterviewMode,
    foundationComplete: boolean,
    correction: string
  ): AiModelSystemPrompt {
    const fixedRules = [
      'You are the DBOLT database knowledge interviewer. Your job is to build a small, durable set of notes about how this specific database is used, so the DBOLT AI assistant answers better in future conversations.',
      `Write every user-facing string in ${responseLanguage}. Keep table, column and schema identifiers exactly as the database returned them.`,
      this.buildScopeLine(scope),
      ...(mode === 'instruct' ? [
        'This turn the user is teaching you something directly, not asking you to explore. Read what they wrote, split it into atomic notes, and propose those notes. Keep their wording and their terms; do not soften or generalise what they said.',
        'You may still check the database to confirm the identifiers they mentioned exist and are spelled the way they wrote them, and you should say in the message when a name they used does not match the metadata.',
        'Then ask what is still missing around what they just taught you.'
      ] : [
        'This turn you are exploring on your own. Investigate first, propose every structural fact you verified, and ask about the business meaning you could not verify.'
      ]),
      ...([
        'BEFORE ANYTHING ELSE, read the saved notes above and judge whether the FOUNDATION of this database is already established. The foundation is complete only when all of these are known: which product or system this database belongs to; what the company does with it; which modules or processes are really used; which tables hold the main entities the team works with; and whether there are customisations and what they are for.',
        'A handful of notes about columns of one table is NOT a foundation. If any item of that list is missing, the foundation is incomplete, and saying otherwise is a policy violation.',
        'Every reply you send must carry the verdict, in this exact shape, alongside the other fields: "foundation":{"complete":false,"missing":["what is missing"]}',
        'DBOLT reads that verdict and it controls what you are allowed to do. While complete is false, reading tables and running queries stays DISABLED, and your job is only to ASK the broad questions that establish the foundation. Once you declare it true, investigation unlocks on your next reply in this same turn.',
        'While the foundation is incomplete: your output is mostly QUESTIONS, at most two notes are accepted, and describing the object list back to the user is not allowed. Naming the families of tables and views you can see teaches nothing and wastes the turn.',
        ...(foundationComplete ? [] : [
          'The foundation is NOT established yet. Do not ask to investigate: the request will be ignored. Ask the broad questions now.',
          'Look at the naming pattern of the objects you listed and say whether it matches a product you already know, naming it explicitly. Schemas from known ERPs and off-the-shelf systems follow documented conventions, and once the user confirms which product this is, you can rely on everything you already know about that schema instead of rediscovering it table by table.',
          'Propose the product identification as a note so the user can confirm or correct it, and make your questions the broad ones: which system this is, which modules or processes the company really uses, whether there are customisations, and which handful of tables the team touches every day.'
        ])
      ] as string[]),
      'Your subject is the DATABASE AS A WHOLE, not one table. In every turn cover several tables and how they connect, unless the user explicitly pointed you at one. Exhaustively documenting a single table is a failure, even if that table is important.',
      'What you are trying to learn, in this order: which tables hold the main business entities; how those tables join to each other; which table is the source of truth when more than one could be; what the values of type, status and code columns mean; what custom or user-defined fields are for; and which tables are dead or unused.',
      'Investigate before you ask. Do not ask the user anything the database can answer: read the columns of the tables that matter, and run read-only SELECTs to see which type, status and code values actually exist.',
      'Two kinds of fact exist, and you treat them differently. A STRUCTURAL fact is verifiable from what the database just returned: which table holds an entity, how two tables join and through which columns, and which distinct code values exist in a column. Propose those as notes directly, saying in the message what proves it, so the user only has to confirm.',
      'A BUSINESS fact is what the tables, codes and custom fields mean in this company process. Never assert it from a name. Ask about it.',
      'A note about a data type, a length, or whether a column accepts null is WORTHLESS and must never be proposed. DBOLT returns that metadata on every request, so writing it down teaches nothing.',
      'An INVENTORY note is equally worthless and equally banned: never propose a note whose content is that the schema contains certain tables or views, how many objects exist, or that a family of names exists. DBOLT lists the objects on every request. Listing what exists is not knowledge; knowledge is what those objects MEAN, which one the process trusts, and how they connect.',
      'Only propose a structural note when it captures a relationship, a source of truth, or the inventory of code VALUES inside a column.',
      'Never ask the user how they want results presented. Sort order, which date to display, whether to use gross or net values, how cancelled rows should appear in a report, column order and formatting are report specifications, not database knowledge, and they are forbidden as questions. Asking about the MEANING of a status or of a date column is allowed; asking which one a report should use is not.',
      'What must never become a note: row values that change, credentials, generated SQL, data types and nullability, report or formatting preferences, anything you are guessing, and anything the user has not confirmed.',
      `Each note must be one atomic fact, at most ${MAX_NOTE_TEXT_CHARS} characters, written so it is still understandable months from now without this conversation. The topic is a short label of at most ${MAX_NOTE_TOPIC_CHARS} characters.`,
      `Propose up to ${MAX_PROPOSED_NOTES} notes per turn and aim for several, not one. Every structural fact you actually verified is worth proposing, because the user only has to click to accept or discard it.`,
      'Only propose nothing when you have neither a structural fact nor an answer from the user. Having read the schema is already enough to propose structural facts about the tables that matter, so an empty turn means you did not investigate enough.',
      'Never repeat a note that is already saved and never propose two notes that say the same thing.',
      `Ask between 2 and ${MAX_QUESTIONS} pertinent questions per turn, ordered from most to least useful. Each question must be answerable on its own, so the user can reply to whichever they want. Only ask what the database cannot answer: never ask something you could have discovered by reading a column or running a SELECT.`,
      'Good questions sound like: what is this table for, what does this code value mean, which of these two tables is the one your process trusts, how do these two tables relate when the metadata does not show it, and what is this custom field used for. Spread your questions across different tables instead of asking several about the same one.',
      'Reply with a single JSON object and nothing else, in this exact shape:',
      '{"foundation":{"complete":false,"missing":["what is missing"]},"message":"what you concluded and what proves it","questions":["first question","second question"],"notes":[{"topic":"short label","text":"one atomic fact"}]}',
      ...(canInvestigateAgain ? [
        'Before answering you may investigate the database. To do that, reply instead with only this JSON object:',
        '{"foundation":{"complete":true,"missing":[]},"investigate":{"tables":["TABLE_A","TABLE_B"],"queries":["SELECT DISTINCT ..."]}}',
        'The foundation verdict travels in every reply, including the investigate one, so DBOLT always knows whether investigation is allowed.',
        `This turn you may still read ${remainingTables} table(s) and run ${remainingQueries} read-only query(ies). Queries must be a single SELECT or WITH; anything else is rejected.`,
        'Spend that budget before you talk. Ask for several DIFFERENT tables at once instead of drilling one, and use the queries to look at the distinct values of the type, status and code columns you just found. A turn where you investigated nothing, or where you only looked at one table, is a wasted turn.'
      ] : [])
    ].join('\n\n');

    return {
      fixedRules,
      collectedData: [
        savedNotes ? `Notes already saved for this database:\n${savedNotes}` : 'No notes are saved for this database yet.',
        investigation.length
          ? `DBOLT read-only investigation for this interview:\n${AiAssistantToolBudget.limitText(investigation.join('\n\n'), MAX_INVESTIGATION_CHARS)}`
          : 'No read-only database context was authorized for this interview, so rely on what the user tells you.'
      ].join('\n\n'),
      turnState: [
        canInvestigateAgain
          ? ''
          : 'You cannot investigate any further this turn. Answer with the message, questions and notes JSON object now.',
        correction
      ].filter((part) => part.length > 0).join(TURN_STATE_SEPARATOR)
    };
  }

  private async readSchemaSummary(context: AiReadonlyDatabaseContext): Promise<string> {
    const budget = AiAssistantToolBudget.createState({ maxToolResultChars: INTERVIEW_TOOL_RESULT_CHARS });
    const result = await AiAssistantTools.execute(
      context,
      { name: 'getSchemaSummary', arguments: { limit: SCHEMA_SUMMARY_LIMIT } },
      budget
    );
    AiAssistantSchemaMemory.remember(context, result);

    return `Schema overview (status ${result.success ? 'ok' : 'error'}):\n${result.content}`;
  }

  private async readTableColumns(
    context: AiReadonlyDatabaseContext,
    tableName: string
  ): Promise<string> {
    const budget = AiAssistantToolBudget.createState({ maxToolResultChars: INTERVIEW_TOOL_RESULT_CHARS });
    const result = await AiAssistantTools.execute(
      context,
      { name: 'getTableColumns', arguments: { tableName } },
      budget
    );
    AiAssistantSchemaMemory.remember(context, result);

    return `Columns of ${tableName} (status ${result.success ? 'ok' : 'error'}):\n${result.content}`;
  }

  private renderSavedNotes(notes: Array<{ topic: string; text: string; source: string }>): string {
    return notes
      .map((note) => `- [${note.topic}] (${note.source}) ${note.text}`)
      .join('\n');
  }

  private normalizeMessages(messages: DatabaseMemoryInterviewMessage[] | undefined): AiModelMessage[] {
    const normalized = (messages || [])
      .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
      .map((message) => ({
        role: message.role,
        content: this.normalizeText(message.content, MAX_MESSAGE_CHARS)
      }))
      .filter((message) => message.content.length > 0)
      .slice(-MAX_CONTEXT_MESSAGES);

    if (normalized.length === 0) {
      return [{
        role: 'user',
        content: 'Start the interview about this database.'
      }];
    }

    return normalized;
  }

  private parseCompletion(content: string): Record<string, unknown> {
    const direct = this.parseJsonObject(content.trim());
    if (direct) {
      return direct;
    }

    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');

    if (start >= 0 && end > start) {
      const embedded = this.parseJsonObject(content.slice(start, end + 1));
      if (embedded) {
        return embedded;
      }
    }

    return this.looksLikeProtocolJson(content)
      ? {}
      : { message: content };
  }

  private looksLikeProtocolJson(content: string): boolean {
    const trimmed = content.trim();

    if (!trimmed.startsWith('{')) {
      return false;
    }

    return /"(?:investigate|inspectTable|notes|questions|message)"\s*:/.test(trimmed);
  }

  private parseJsonObject(value: string): Record<string, unknown> | null {
    const unfenced = value
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    if (!unfenced.startsWith('{')) {
      return null;
    }

    for (const candidate of [unfenced, this.escapeControlCharactersInStrings(unfenced)]) {
      try {
        const parsed = JSON.parse(candidate);

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch (_error: unknown) {
        continue;
      }
    }

    return null;
  }

  private escapeControlCharactersInStrings(value: string): string {
    const backslash = 92;
    const quote = 34;
    let result = '';
    let insideString = false;
    let escaped = false;

    for (const char of value) {
      const code = char.charCodeAt(0);

      if (escaped) {
        result += char;
        escaped = false;
        continue;
      }

      if (insideString && code === backslash) {
        result += char;
        escaped = true;
        continue;
      }

      if (code === quote) {
        insideString = !insideString;
        result += char;
        continue;
      }

      if (insideString && code < 32) {
        result += this.escapeControlCode(code);
        continue;
      }

      result += char;
    }

    return result;
  }

  private escapeControlCode(code: number): string {
    const prefix = String.fromCharCode(92);

    if (code === 10) return prefix + 'n';
    if (code === 13) return prefix + 'r';
    if (code === 9) return prefix + 't';

    return prefix + 'u' + code.toString(16).padStart(4, '0');
  }

  private normalizeQuestions(parsed: Record<string, unknown>): string[] {
    const raw = Array.isArray(parsed['questions'])
      ? parsed['questions']
      : [parsed['question']];
    const questions: string[] = [];

    for (const candidate of raw) {
      const question = this.normalizeText(candidate, 400);

      if (question && !questions.includes(question)) {
        questions.push(question);
      }

      if (questions.length >= MAX_QUESTIONS) {
        break;
      }
    }

    return questions;
  }

  private normalizeProposedNotes(value: unknown): DatabaseMemoryProposedNote[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const notes: DatabaseMemoryProposedNote[] = [];

    for (const item of value) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const record = item as Record<string, unknown>;
      const text = this.normalizeText(record['text'], MAX_NOTE_TEXT_CHARS);

      if (!text) {
        continue;
      }

      const key = DatabaseMemoryStorage.buildDedupeKey({ text });

      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      notes.push({
        topic: this.normalizeText(record['topic'], MAX_NOTE_TOPIC_CHARS) || 'geral',
        text
      });

      if (notes.length >= MAX_PROPOSED_NOTES) {
        break;
      }
    }

    return notes;
  }

  private readFoundationVerdict(parsed: Record<string, unknown>): boolean | null {
    const raw = parsed['foundation'];

    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const complete = (raw as Record<string, unknown>)['complete'];
    return typeof complete === 'boolean' ? complete : null;
  }

  private buildInvestigationNudge(): string {
    return [
      'You declared the foundation complete, so investigation is now unlocked and you must use it before answering.',
      'Reply with the investigate JSON object and read the tables that matter for the questions you are about to ask.'
    ].join(' ');
  }

  private buildCorrection(foundationComplete: boolean, missingVerdict: boolean = false): string {
    return [
      missingVerdict
        ? 'Your previous reply could not be used because it did not carry the foundation verdict, which is mandatory in every reply.'
        : 'Your previous reply could not be used because it carried no question and no note.',
      !foundationComplete
        ? 'Reading tables and running queries is disabled on this first turn, so stop asking for it. Reply now with the message, questions and notes JSON object, and make the questions the broad ones about what this database is and how the company uses it.'
        : 'Reply now with the message, questions and notes JSON object.'
    ].join(' ');
  }

  private limitNotesForTurn(
    notes: DatabaseMemoryProposedNote[],
    foundationComplete: boolean
  ): DatabaseMemoryProposedNote[] {
    return foundationComplete ? notes : notes.slice(0, MAX_FOUNDATION_NOTES);
  }

  private buildEmptyTurnMessage(responseLanguage: string): string {
    return responseLanguage.includes('Portuguese')
      ? 'Não consegui organizar uma resposta útil nesta rodada. Tente responder novamente ou me diga por onde começar.'
      : 'I could not put together a useful answer this round. Answer again or tell me where to start.';
  }

  private buildScopeLine(scope: DatabaseMemoryScope): string {
    const parts = [
      ['Connection', scope.connectionName],
      ['Database engine/type', scope.sgbd],
      ['Database', scope.database],
      ['Schema', scope.schema]
    ]
      .filter((part) => Boolean(part[1]))
      .map((part) => `${part[0]}: ${part[1]}`);

    return parts.length
      ? `Interview scope | ${parts.join(' | ')}`
      : 'Interview scope | not identified';
  }

  private normalizeText(value: unknown, maxChars: number): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value.trim().slice(0, maxChars);
  }
}

export default new DatabaseMemoryInterviewService();
