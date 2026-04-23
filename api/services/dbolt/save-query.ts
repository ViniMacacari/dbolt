import QueryStorage from '../../utils/query-storage.js';
import loadSavedQueries from './load-query.js';

import type {
  ConnectionServiceResult,
  SavedEntityResult,
  SavedQuery,
  SavedQueryInput
} from '../../types.js';

class SaveQuery {
  async newQuery(query: SavedQueryInput): Promise<ConnectionServiceResult> {
    const existingQueries = await loadSavedQueries.getAllQueries();

    const hasDuplicateName = existingQueries.some(
      (storedQuery) => storedQuery.name.toLowerCase() === query.name.toLowerCase()
    );

    const hasDuplicateDetails = existingQueries.some(
      (storedQuery) => storedQuery.sql.trim() === query.sql.trim()
    );

    if (hasDuplicateName || hasDuplicateDetails) {
      const errorMessage = hasDuplicateName
        ? 'A query with the same name already exists.'
        : 'A query with the same database, version, and SQL already exists.';
      throw new Error(errorMessage);
    }

    await QueryStorage.saveQueriesFile([query]);

    return { success: true, message: 'Query saved successfully!' };
  }

  async updateExistingQuery(
    id: number,
    updatedData: SavedQueryInput
  ): Promise<SavedEntityResult<SavedQuery>> {
    const updatedQuery = await QueryStorage.updateQueryById(id, updatedData);

    return {
      success: true,
      message: 'Query updated successfully',
      data: updatedQuery
    };
  }
}

export default new SaveQuery();
