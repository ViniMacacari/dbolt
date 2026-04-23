import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import {
  type SavedQuery,
  type SavedQueryInput,
  type StoredQueriesResult,
  isSavedQuery
} from '../types.js';

class QueryStorage {
  private readonly basePath: string;

  constructor() {
    this.basePath = join(homedir(), 'Documents', 'dbolt', 'queries');
  }

  async ensureDirectoryExists(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async saveQueriesFile(newQueries: SavedQueryInput[]): Promise<void> {
    await this.ensureDirectoryExists();
    const filePath = join(this.basePath, 'queries.json');
    const existingQueries = await this.readQueriesFile();

    const lastId =
      existingQueries.length > 0
        ? Math.max(...existingQueries.map((query) => query.id))
        : 0;

    const updatedQueries: SavedQuery[] = [
      ...existingQueries,
      ...newQueries.map((query, index) => ({
        id: lastId + index + 1,
        ...query
      }))
    ];

    await fs.writeFile(filePath, JSON.stringify(updatedQueries, null, 2), 'utf8');
  }

  async readQueriesFile(): Promise<StoredQueriesResult> {
    const filePath = join(this.basePath, 'queries.json');

    try {
      const data = await fs.readFile(filePath, 'utf8');
      if (!data) {
        return [];
      }

      const parsed = JSON.parse(data) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isSavedQuery) : [];
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

  async deleteQueryById(id: number): Promise<boolean> {
    const queries = await this.readQueriesFile();
    const updatedQueries = queries.filter((query) => query.id !== Number(id));

    if (queries.length === updatedQueries.length) {
      return false;
    }

    const filePath = join(this.basePath, 'queries.json');
    await fs.writeFile(filePath, JSON.stringify(updatedQueries, null, 2), 'utf8');
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

    const updatedQuery: SavedQuery = {
      id: Number(id),
      ...updatedData
    };

    queries[queryIndex] = updatedQuery;

    const filePath = join(this.basePath, 'queries.json');
    await fs.writeFile(filePath, JSON.stringify(queries, null, 2), 'utf8');
    return updatedQuery;
  }
}

export default new QueryStorage();
