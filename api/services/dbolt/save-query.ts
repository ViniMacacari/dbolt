import QueryStorage from '../../utils/query-storage.js';
import loadSavedQueries from './load-query.js';

import type {
  SavedEntityResult,
  SavedQuery,
  SavedQueryInput
} from '../../types.js';

class SaveQuery {
  async newQuery(query: SavedQueryInput): Promise<SavedEntityResult<SavedQuery>> {
    const existingQueries = await loadSavedQueries.getAllQueries();
    const queryFolderPath = this.normalizeFolderPath(query.folderPath);

    const hasDuplicateName = existingQueries.some(
      (storedQuery) =>
        storedQuery.name.toLowerCase() === query.name.toLowerCase() &&
        this.normalizeFolderPath(storedQuery.folderPath) === queryFolderPath
    );

    if (hasDuplicateName) {
      throw new Error('A query with the same name already exists in this folder.');
    }

    const savedQueries = await QueryStorage.saveQueriesFile([query]);
    const savedQuery = savedQueries[0];

    if (!savedQuery) {
      throw new Error('Query was not saved.');
    }

    return {
      success: true,
      message: 'Query saved successfully!',
      data: savedQuery
    };
  }

  async updateExistingQuery(
    id: number,
    updatedData: SavedQueryInput
  ): Promise<SavedEntityResult<SavedQuery>> {
    const existingQueries = await loadSavedQueries.getAllQueries();
    const queryFolderPath = this.normalizeFolderPath(updatedData.folderPath);
    const hasDuplicateName = existingQueries.some(
      (storedQuery) =>
        storedQuery.id !== id &&
        storedQuery.name.toLowerCase() === updatedData.name.toLowerCase() &&
        this.normalizeFolderPath(storedQuery.folderPath) === queryFolderPath
    );

    if (hasDuplicateName) {
      throw new Error('A query with the same name already exists in this folder.');
    }

    const updatedQuery = await QueryStorage.updateQueryById(id, updatedData);

    return {
      success: true,
      message: 'Query updated successfully',
      data: updatedQuery
    };
  }

  async restoreVersion(
    id: number,
    versionId: number
  ): Promise<SavedEntityResult<SavedQuery>> {
    const restoredQuery = await QueryStorage.restoreQueryVersion(id, versionId);

    return {
      success: true,
      message: 'Query version restored successfully',
      data: restoredQuery
    };
  }

  private normalizeFolderPath(folderPath: string | undefined): string {
    return String(folderPath || '')
      .replace(/\\/g, '/')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join('/')
      .toLowerCase();
  }
}

export default new SaveQuery();
