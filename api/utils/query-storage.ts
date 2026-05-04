import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import {
  type SavedQuery,
  type SavedQueryInput,
  type SavedQueryVersion,
  type StoredQueriesResult,
  isSavedQuery
} from '../types.js';

const QUERIES_FILENAME = 'queries.json';
const TEMP_FILENAME = `${QUERIES_FILENAME}.tmp`;
const BACKUP_FILENAME = `${QUERIES_FILENAME}.bak`;
const MAX_QUERY_NAME_LENGTH = 120;
const MAX_FOLDER_SEGMENT_LENGTH = 120;
const INVALID_PORTABLE_FILENAME_CHARS = /[<>:"\\|?*\x00-\x1F]/;
const WINDOWS_RESERVED_FILENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

class QueryStorage {
  private readonly basePath: string;

  constructor() {
    this.basePath = join(homedir(), 'Documents', 'dbolt', 'queries');
  }

  async ensureDirectoryExists(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async saveQueriesFile(newQueries: SavedQueryInput[]): Promise<SavedQuery[]> {
    await this.ensureDirectoryExists();
    const existingQueries = await this.readQueriesFile();

    const lastId =
      existingQueries.length > 0
        ? Math.max(...existingQueries.map((query) => query.id))
        : 0;

    const savedQueries = newQueries.map((query, index) =>
      this.createSavedQuery(lastId + index + 1, query)
    );

    await this.writeQueriesFile([
      ...existingQueries,
      ...savedQueries
    ]);

    return savedQueries;
  }

  async readQueriesFile(): Promise<StoredQueriesResult> {
    await this.ensureDirectoryExists();
    await this.restoreBackupIfNeeded();

    try {
      const data = await fs.readFile(this.getQueriesFilePath(), 'utf8');
      if (!data) {
        return [];
      }

      const parsed = JSON.parse(data) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter(isSavedQuery).map((query) => this.normalizeStoredQuery(query))
        : [];
    } catch (error: unknown) {
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;

      if (errorCode === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  async getQueryById(id: number): Promise<SavedQuery | null> {
    const queries = await this.readQueriesFile();
    return queries.find((query) => query.id === Number(id)) ?? null;
  }

  async getFolders(): Promise<string[]> {
    const folders = new Set<string>();
    const queries = await this.readQueriesFile();

    for (const query of queries) {
      if (!query.folderPath) {
        continue;
      }

      const parts = query.folderPath.split('/');
      for (let index = 1; index <= parts.length; index++) {
        folders.add(parts.slice(0, index).join('/'));
      }
    }

    return [...folders].sort((left, right) => left.localeCompare(right));
  }

  async getQueryVersions(id: number): Promise<SavedQueryVersion[]> {
    const query = await this.getQueryById(id);
    if (!query) {
      throw new Error(`Query with id ${id} not found`);
    }

    return this.normalizeVersions(query.versions).sort((left, right) =>
      right.changedAt.localeCompare(left.changedAt)
    );
  }

  async getQueryVersionById(id: number, versionId: number): Promise<SavedQueryVersion | null> {
    const versions = await this.getQueryVersions(id);
    return versions.find((version) => version.id === Number(versionId)) ?? null;
  }

  async restoreQueryVersion(id: number, versionId: number): Promise<SavedQuery> {
    const queries = await this.readQueriesFile();
    const queryIndex = queries.findIndex((query) => query.id === Number(id));

    if (queryIndex === -1) {
      throw new Error(`Query with id ${id} not found`);
    }

    const query = queries[queryIndex];
    const version = this.normalizeVersions(query.versions).find((item) => item.id === Number(versionId));

    if (!version) {
      throw new Error(`Version with id ${versionId} not found`);
    }

    const restoredQuery = this.createSavedQuery(
      Number(id),
      {
        name: version.name,
        type: query.type,
        sql: version.sql,
        dbSchema: version.dbSchema ?? query.dbSchema,
        folderPath: version.folderPath ?? query.folderPath,
        versioningEnabled: query.versioningEnabled
      },
      query
    );

    queries[queryIndex] = restoredQuery;
    await this.writeQueriesFile(queries);

    return restoredQuery;
  }

  async deleteQueryById(id: number): Promise<boolean> {
    const queries = await this.readQueriesFile();
    const updatedQueries = queries.filter((query) => query.id !== Number(id));

    if (queries.length === updatedQueries.length) {
      return false;
    }

    await this.writeQueriesFile(updatedQueries);
    return true;
  }

  async updateQueryById(
    id: number,
    updatedData: SavedQueryInput
  ): Promise<SavedQuery> {
    const queries = await this.readQueriesFile();
    const queryIndex = queries.findIndex((query) => query.id === Number(id));

    if (queryIndex === -1) {
      throw new Error(`Query with id ${id} not found`);
    }

    const existingQuery = queries[queryIndex];
    const mergedData: SavedQueryInput = {
      name: updatedData.name ?? existingQuery.name,
      type: updatedData.type ?? existingQuery.type,
      sql: updatedData.sql ?? existingQuery.sql,
      dbSchema: updatedData.dbSchema ?? existingQuery.dbSchema,
      folderPath: Object.prototype.hasOwnProperty.call(updatedData, 'folderPath')
        ? updatedData.folderPath
        : existingQuery.folderPath,
      versioningEnabled: typeof updatedData.versioningEnabled === 'boolean'
        ? updatedData.versioningEnabled
        : existingQuery.versioningEnabled
    };

    const updatedQuery = this.createSavedQuery(Number(id), mergedData, existingQuery);

    queries[queryIndex] = updatedQuery;
    await this.writeQueriesFile(queries);
    return updatedQuery;
  }

  private createSavedQuery(
    id: number,
    query: SavedQueryInput,
    existingQuery?: SavedQuery
  ): SavedQuery {
    const now = new Date().toISOString();
    const folderPath = this.normalizeFolderPath(query.folderPath);
    const versions = this.normalizeVersions(existingQuery?.versions);
    const savedQuery: SavedQuery = {
      id,
      name: this.normalizeQueryName(query.name),
      type: query.type || 'sql',
      sql: String(query.sql ?? ''),
      dbSchema: query.dbSchema,
      versioningEnabled: Boolean(query.versioningEnabled),
      createdAt: existingQuery?.createdAt || now,
      updatedAt: now,
      versions
    };

    if (folderPath) {
      savedQuery.folderPath = folderPath;
    }

    if (savedQuery.versioningEnabled) {
      savedQuery.versions = this.appendVersion(versions, savedQuery, now);
    }

    return savedQuery;
  }

  private normalizeStoredQuery(query: SavedQuery): SavedQuery {
    return {
      ...query,
      folderPath: this.normalizeStoredFolderPath(query.folderPath),
      versioningEnabled: Boolean(query.versioningEnabled),
      versions: this.normalizeVersions(query.versions)
    };
  }

  private appendVersion(
    versions: SavedQueryVersion[],
    query: SavedQuery,
    changedAt: string
  ): SavedQueryVersion[] {
    return [
      ...versions,
      {
        id: this.getNextVersionId(versions),
        changedAt,
        name: query.name,
        sql: query.sql,
        folderPath: query.folderPath,
        dbSchema: query.dbSchema
      }
    ];
  }

  private getNextVersionId(versions: SavedQueryVersion[]): number {
    return versions.length > 0
      ? Math.max(...versions.map((version) => version.id)) + 1
      : 1;
  }

  private normalizeVersions(versions: SavedQueryVersion[] | undefined): SavedQueryVersion[] {
    if (!Array.isArray(versions)) {
      return [];
    }

    return versions
      .filter((version) =>
        typeof version.id === 'number' &&
        typeof version.changedAt === 'string' &&
        typeof version.name === 'string' &&
        typeof version.sql === 'string'
      )
      .map((version) => ({
        id: version.id,
        changedAt: version.changedAt,
        name: version.name,
        sql: version.sql,
        folderPath: this.normalizeStoredFolderPath(version.folderPath),
        dbSchema: version.dbSchema
      }));
  }

  private normalizeQueryName(name: string): string {
    const normalizedName = String(name || '').trim();

    if (!normalizedName) {
      throw new Error('Query name cannot be empty.');
    }

    if (normalizedName.length > MAX_QUERY_NAME_LENGTH) {
      throw new Error(`Query name cannot exceed ${MAX_QUERY_NAME_LENGTH} characters.`);
    }

    this.assertPortablePathSegment(normalizedName, 'Query name');
    return normalizedName;
  }

  private normalizeFolderPath(folderPath: string | undefined): string {
    const normalizedPath = this.normalizeStoredFolderPath(folderPath);

    if (!normalizedPath) {
      return '';
    }

    for (const segment of normalizedPath.split('/')) {
      if (segment.length > MAX_FOLDER_SEGMENT_LENGTH) {
        throw new Error(`Folder names cannot exceed ${MAX_FOLDER_SEGMENT_LENGTH} characters.`);
      }

      this.assertPortablePathSegment(segment, 'Folder name');
    }

    return normalizedPath;
  }

  private normalizeStoredFolderPath(folderPath: string | undefined): string {
    const rawPath = String(folderPath || '').replace(/\\/g, '/').trim();
    if (!rawPath) {
      return '';
    }

    return rawPath
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join('/');
  }

  private assertPortablePathSegment(value: string, label: string): void {
    if (value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
      throw new Error(`${label} cannot contain path traversal characters.`);
    }

    if (INVALID_PORTABLE_FILENAME_CHARS.test(value)) {
      throw new Error(`${label} contains characters that are not supported on Windows and Linux.`);
    }

    if (WINDOWS_RESERVED_FILENAME.test(value)) {
      throw new Error(`${label} uses a reserved Windows file name.`);
    }
  }

  private async writeQueriesFile(
    queries: SavedQuery[]
  ): Promise<void> {
    await this.ensureDirectoryExists();

    const filePath = this.getQueriesFilePath();
    const tempFilePath = this.getTempFilePath();
    const backupFilePath = this.getBackupFilePath();
    const payload = JSON.stringify(queries, null, 2);

    await fs.unlink(backupFilePath).catch(() => undefined);
    await fs.writeFile(tempFilePath, payload, 'utf8');

    try {
      await fs.access(filePath);
      await fs.rename(filePath, backupFilePath);
    } catch (error: unknown) {
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;

      if (errorCode !== 'ENOENT') {
        await fs.unlink(tempFilePath).catch(() => undefined);
        throw error;
      }
    }

    try {
      await fs.rename(tempFilePath, filePath);
      await fs.unlink(backupFilePath).catch(() => undefined);
    } catch (error: unknown) {
      await this.restoreFromBackup();
      throw error;
    }
  }

  private getQueriesFilePath(): string {
    return join(this.basePath, QUERIES_FILENAME);
  }

  private getTempFilePath(): string {
    return join(this.basePath, TEMP_FILENAME);
  }

  private getBackupFilePath(): string {
    return join(this.basePath, BACKUP_FILENAME);
  }

  private async restoreBackupIfNeeded(): Promise<void> {
    const filePath = this.getQueriesFilePath();
    const backupFilePath = this.getBackupFilePath();

    try {
      await fs.access(filePath);
    } catch (error: unknown) {
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;

      if (errorCode === 'ENOENT') {
        await this.restoreFromBackup();
      }
    }
  }

  private async restoreFromBackup(): Promise<void> {
    const filePath = this.getQueriesFilePath();
    const tempFilePath = this.getTempFilePath();
    const backupFilePath = this.getBackupFilePath();

    await fs.unlink(tempFilePath).catch(() => undefined);

    try {
      await fs.access(backupFilePath);
      await fs.rename(backupFilePath, filePath);
    } catch (error: unknown) {
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : undefined;

      if (errorCode !== 'ENOENT') {
        throw error;
      }
    }
  }
}

export default new QueryStorage();
