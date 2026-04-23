import QueryStorage from '../../utils/query-storage.js';
import { getErrorMessage } from '../../utils/errors.js';

import type { SavedQuery, StoredQueriesResult } from '../../types.js';

class LoadQueries {
  async getAllQueries(): Promise<StoredQueriesResult> {
    try {
      const queries = await QueryStorage.readQueriesFile();
      console.log('All queries loaded successfully:', queries);
      return queries;
    } catch (error: unknown) {
      console.error('Error loading queries:', error);
      throw new Error(getErrorMessage(error, 'Failed to load queries'));
    }
  }

  async getQueryByName(queryName: string): Promise<SavedQuery[]> {
    try {
      const queries = await this.getAllQueries();
      const filteredQueries = queries.filter(
        (query) => query.name.toLowerCase() === queryName.toLowerCase()
      );

      if (filteredQueries.length === 0) {
        console.log(`No queries found with name: ${queryName}`);
        return [];
      }

      console.log(`Queries with name "${queryName}" loaded successfully:`);
      return filteredQueries;
    } catch (error: unknown) {
      console.error(`Error fetching queries with name "${queryName}":`, error);
      throw new Error(getErrorMessage(error, 'Failed to fetch queries by name'));
    }
  }

  async getQueryById(id: number): Promise<SavedQuery | null> {
    try {
      const queries = await this.getAllQueries();
      const query = queries.find((item) => item.id === id) ?? null;

      if (!query) {
        console.log(`Query with ID ${id} not found.`);
        return null;
      }

      console.log(`Query with ID "${id}" loaded successfully:`, query);
      return query;
    } catch (error: unknown) {
      console.error(`Error fetching query with ID "${id}":`, error);
      throw new Error(getErrorMessage(error, 'Failed to fetch query by ID'));
    }
  }

  async deleteQueryById(id: number): Promise<boolean> {
    try {
      const result = await QueryStorage.deleteQueryById(id);
      if (!result) {
        console.log(`Query with ID ${id} not found. Nothing to delete.`);
        return false;
      }

      console.log(`Query with ID ${id} deleted successfully.`);
      return true;
    } catch (error: unknown) {
      console.error(`Error deleting query with ID "${id}":`, error);
      throw new Error(getErrorMessage(error, 'Failed to delete query by ID'));
    }
  }
}

export default new LoadQueries();
