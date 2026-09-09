import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash, randomUUID } from 'crypto';

export const MAX_NOTE_TEXT_CHARS = 400;
export const MAX_NOTE_TOPIC_CHARS = 60;
export const MAX_NOTES_PER_SCOPE = 80;

const STORAGE_FOLDER = 'database-memory';
const STORAGE_VERSION = 1;

export type DatabaseMemoryNoteSource = 'ai' | 'user';

export interface DatabaseMemoryScope {
  sgbd?: string;
  connectionName?: string;
  database?: string;
  schema?: string;
}

export interface DatabaseMemoryNote {
  id: string;
  topic: string;
  text: string;
  source: DatabaseMemoryNoteSource;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseMemoryRecord {
  version: number;
  scope: DatabaseMemoryScope;
  notes: DatabaseMemoryNote[];
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseMemoryNoteInput {
  topic?: string;
  text?: string;
  source?: DatabaseMemoryNoteSource;
}

class DatabaseMemoryStorage {
  private readonly basePath: string;

  constructor() {
    this.basePath = join(homedir(), 'Documents', 'dbolt', STORAGE_FOLDER);
  }

  getStorageFolder(): string {
    return this.basePath;
  }

  isIdentifiedScope(scope: DatabaseMemoryScope): boolean {
    return this.buildScopeIdentity(scope).length > 0;
  }

  async read(scope: DatabaseMemoryScope): Promise<DatabaseMemoryRecord> {
    const filePath = this.getScopeFilePath(scope);

    try {
      const payload = await fs.readFile(filePath, 'utf8');
      return this.normalizeRecord(JSON.parse(payload), scope);
    } catch (error: unknown) {
      if (this.isMissingFileError(error)) {
        return this.createEmptyRecord(scope);
      }

      throw error;
    }
  }

  async write(scope: DatabaseMemoryScope, notes: DatabaseMemoryNote[]): Promise<DatabaseMemoryRecord> {
    const existing = await this.read(scope);
    const record: DatabaseMemoryRecord = {
      version: STORAGE_VERSION,
      scope: this.normalizeScope(scope),
      notes: notes.slice(-MAX_NOTES_PER_SCOPE),
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };

    await this.writeRecordFile(scope, record);
    return record;
  }

  buildNote(input: DatabaseMemoryNoteInput, source: DatabaseMemoryNoteSource): DatabaseMemoryNote | null {
    const text = this.normalizeText(input.text, MAX_NOTE_TEXT_CHARS);

    if (!text) {
      return null;
    }

    const timestamp = new Date().toISOString();

    return {
      id: randomUUID(),
      topic: this.normalizeText(input.topic, MAX_NOTE_TOPIC_CHARS) || 'geral',
      text,
      source: input.source === 'user' || input.source === 'ai' ? input.source : source,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  buildDedupeKey(note: Pick<DatabaseMemoryNote, 'text'>): string {
    return note.text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private async writeRecordFile(scope: DatabaseMemoryScope, record: DatabaseMemoryRecord): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });

    const filePath = this.getScopeFilePath(scope);
    const tempFilePath = `${filePath}.tmp`;
    const payload = JSON.stringify(record, null, 2);

    await fs.writeFile(tempFilePath, payload, 'utf8');

    try {
      await fs.rename(tempFilePath, filePath);
    } catch (error: unknown) {
      await fs.unlink(tempFilePath).catch(() => undefined);
      throw error;
    }
  }

  private getScopeFilePath(scope: DatabaseMemoryScope): string {
    return join(this.basePath, `${this.buildScopeFileName(scope)}.json`);
  }

  private buildScopeFileName(scope: DatabaseMemoryScope): string {
    const identity = this.buildScopeIdentity(scope);
    const readable = identity
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .toLowerCase();
    const digest = createHash('sha1').update(identity).digest('hex').slice(0, 10);

    return readable ? `${readable}-${digest}` : `unidentified-${digest}`;
  }

  private buildScopeIdentity(scope: DatabaseMemoryScope): string {
    return [
      this.normalizeText(scope.sgbd, 40).toLowerCase(),
      this.normalizeText(scope.connectionName, 80).toLowerCase(),
      this.normalizeText(scope.database, 80).toLowerCase(),
      this.normalizeText(scope.schema, 80).toLowerCase()
    ]
      .filter((part) => part.length > 0)
      .join('|');
  }

  private normalizeRecord(value: unknown, scope: DatabaseMemoryScope): DatabaseMemoryRecord {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const rawNotes = Array.isArray(record['notes']) ? record['notes'] : [];
    const notes = rawNotes
      .map((note) => this.normalizeNote(note))
      .filter((note): note is DatabaseMemoryNote => note !== null)
      .slice(-MAX_NOTES_PER_SCOPE);

    return {
      version: STORAGE_VERSION,
      scope: this.normalizeScope((record['scope'] as DatabaseMemoryScope) || scope),
      notes,
      createdAt: this.normalizeDate(record['createdAt']),
      updatedAt: this.normalizeDate(record['updatedAt'])
    };
  }

  private normalizeNote(value: unknown): DatabaseMemoryNote | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const text = this.normalizeText(record['text'], MAX_NOTE_TEXT_CHARS);

    if (!text) {
      return null;
    }

    return {
      id: typeof record['id'] === 'string' && record['id'].trim() ? record['id'].trim() : randomUUID(),
      topic: this.normalizeText(record['topic'], MAX_NOTE_TOPIC_CHARS) || 'geral',
      text,
      source: record['source'] === 'user' ? 'user' : 'ai',
      createdAt: this.normalizeDate(record['createdAt']),
      updatedAt: this.normalizeDate(record['updatedAt'])
    };
  }

  private normalizeScope(scope: DatabaseMemoryScope | undefined): DatabaseMemoryScope {
    return {
      sgbd: this.normalizeText(scope?.sgbd, 40),
      connectionName: this.normalizeText(scope?.connectionName, 80),
      database: this.normalizeText(scope?.database, 80),
      schema: this.normalizeText(scope?.schema, 80)
    };
  }

  private normalizeText(value: unknown, maxChars: number): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value.replace(/\s+/g, ' ').trim().slice(0, maxChars);
  }

  private normalizeDate(value: unknown): string {
    if (typeof value === 'string') {
      const parsed = new Date(value);

      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    return new Date().toISOString();
  }

  private createEmptyRecord(scope: DatabaseMemoryScope): DatabaseMemoryRecord {
    const timestamp = new Date().toISOString();

    return {
      version: STORAGE_VERSION,
      scope: this.normalizeScope(scope),
      notes: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  private isMissingFileError(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === 'ENOENT';
  }
}

export default new DatabaseMemoryStorage();
