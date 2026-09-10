import DatabaseMemoryStorage, {
  MAX_NOTES_PER_SCOPE,
  type DatabaseMemoryNote,
  type DatabaseMemoryNoteInput,
  type DatabaseMemoryNoteSource,
  type DatabaseMemoryRecord,
  type DatabaseMemoryScope
} from '../../utils/database-memory-storage.js';

const MAX_PROMPT_BLOCK_CHARS = 12000;
const MAX_NOTES_PER_REQUEST = 10;

export interface DatabaseMemoryUpdateInput {
  topic?: string;
  text?: string;
}

class DatabaseMemoryService {
  getStorageFolder(): string {
    return DatabaseMemoryStorage.getStorageFolder();
  }

  async get(scope: DatabaseMemoryScope): Promise<DatabaseMemoryRecord> {
    return await DatabaseMemoryStorage.read(this.requireScope(scope));
  }

  async addNotes(
    scope: DatabaseMemoryScope,
    notes: DatabaseMemoryNoteInput[],
    source: DatabaseMemoryNoteSource
  ): Promise<DatabaseMemoryRecord> {
    const validScope = this.requireScope(scope);
    const record = await DatabaseMemoryStorage.read(validScope);
    const existingKeys = new Set(record.notes.map((note) => DatabaseMemoryStorage.buildDedupeKey(note)));
    const accepted: DatabaseMemoryNote[] = [];

    for (const input of (notes || []).slice(0, MAX_NOTES_PER_REQUEST)) {
      const note = DatabaseMemoryStorage.buildNote(input, source);

      if (!note) {
        continue;
      }

      const key = DatabaseMemoryStorage.buildDedupeKey(note);

      if (!key || existingKeys.has(key)) {
        continue;
      }

      existingKeys.add(key);
      accepted.push(note);
    }

    if (accepted.length === 0) {
      return record;
    }

    return await DatabaseMemoryStorage.write(validScope, [...record.notes, ...accepted]);
  }

  async updateNote(
    scope: DatabaseMemoryScope,
    noteId: string,
    update: DatabaseMemoryUpdateInput
  ): Promise<DatabaseMemoryRecord> {
    const validScope = this.requireScope(scope);
    const record = await DatabaseMemoryStorage.read(validScope);
    const target = record.notes.find((note) => note.id === noteId);

    if (!target) {
      throw new Error('Database memory note was not found.');
    }

    const replacement = DatabaseMemoryStorage.buildNote({
      topic: typeof update.topic === 'string' ? update.topic : target.topic,
      text: typeof update.text === 'string' ? update.text : target.text,
      source: target.source
    }, target.source);

    if (!replacement) {
      throw new Error('Database memory note text was not provided.');
    }

    return await DatabaseMemoryStorage.write(validScope, record.notes.map((note) => (
      note.id === noteId
        ? { ...replacement, id: target.id, createdAt: target.createdAt }
        : note
    )));
  }

  async deleteNote(scope: DatabaseMemoryScope, noteId: string): Promise<DatabaseMemoryRecord> {
    const validScope = this.requireScope(scope);
    const record = await DatabaseMemoryStorage.read(validScope);

    return await DatabaseMemoryStorage.write(
      validScope,
      record.notes.filter((note) => note.id !== noteId)
    );
  }

  async clear(scope: DatabaseMemoryScope): Promise<DatabaseMemoryRecord> {
    return await DatabaseMemoryStorage.write(this.requireScope(scope), []);
  }

  async buildPromptBlock(scope: DatabaseMemoryScope | undefined): Promise<string> {
    if (!scope || !DatabaseMemoryStorage.isIdentifiedScope(scope)) {
      return '';
    }

    const record = await DatabaseMemoryStorage.read(scope).catch(() => null);

    if (!record || record.notes.length === 0) {
      return '';
    }

    return this.renderPromptBlock(record);
  }

  private renderPromptBlock(record: DatabaseMemoryRecord): string {
    const header = [
      'Database knowledge saved in DBOLT for this connection, database and schema, reviewed by the user:',
      this.buildScopeLine(record.scope)
    ];
    const footer = [
      'Treat these notes as business and modeling context provided by the user, not as a substitute for metadata. Column and table names still have to come from DBOLT read-only metadata before you use them in SQL.',
      'If a note contradicts what the database returns now, trust the database and tell the user the note looks outdated.'
    ];
    const budget = MAX_PROMPT_BLOCK_CHARS
      - header.join('\n').length
      - footer.join('\n').length
      - 4;
    const lines: string[] = [];
    let used = 0;

    for (const note of this.sortNotesForPrompt(record.notes)) {
      const line = `- [${note.topic}] ${note.text}`;

      if (used + line.length + 1 > budget) {
        break;
      }

      lines.push(line);
      used += line.length + 1;
    }

    if (lines.length === 0) {
      return '';
    }

    const omitted = record.notes.length - lines.length;

    return [
      ...header,
      ...lines,
      ...(omitted > 0 ? [`(${omitted} additional saved notes were omitted to fit the prompt budget.)`] : []),
      ...footer
    ].join('\n');
  }

  private sortNotesForPrompt(notes: DatabaseMemoryNote[]): DatabaseMemoryNote[] {
    return [...notes]
      .sort((left, right) => {
        if (left.source !== right.source) {
          return left.source === 'user' ? -1 : 1;
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, MAX_NOTES_PER_SCOPE);
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

    return parts.length ? `Scope | ${parts.join(' | ')}` : 'Scope | not identified';
  }

  private requireScope(scope: DatabaseMemoryScope): DatabaseMemoryScope {
    if (!scope || !DatabaseMemoryStorage.isIdentifiedScope(scope)) {
      throw new Error('The database memory scope needs at least a connection, database or schema name.');
    }

    return scope;
  }
}

export default new DatabaseMemoryService();
