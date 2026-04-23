import DbConnections from '../../utils/connections.js';
import { getErrorMessage } from '../../utils/errors.js';

import type { SavedConnection, StoredConnectionsResult } from '../../types.js';

class LoadConnections {
  async getAllConnections(): Promise<StoredConnectionsResult> {
    try {
      return await DbConnections.readConnectionsFile();
    } catch (error: unknown) {
      console.error('Error loading connections:', error);
      throw new Error(getErrorMessage(error, 'Failed to load connections'));
    }
  }

  async getConnectionByDatabase(databaseName: string): Promise<SavedConnection[]> {
    try {
      const connections = await this.getAllConnections();
      const filteredConnections = connections.filter(
        (connection) =>
          connection.database.toLowerCase() === databaseName.toLowerCase()
      );

      if (filteredConnections.length === 0) {
        console.log(`No connections found for database: ${databaseName}`);
        return [];
      }

      console.log(
        `Connections for database "${databaseName}" loaded successfully:`
      );
      return filteredConnections;
    } catch (error: unknown) {
      console.error(
        `Error fetching connections for database "${databaseName}":`,
        error
      );
      throw new Error(getErrorMessage(error, 'Failed to fetch connections'));
    }
  }

  async getConnectionById(id: number): Promise<SavedConnection | null> {
    try {
      const connections = await this.getAllConnections();
      const connection = connections.find((item) => item.id === id) ?? null;

      if (!connection) {
        console.log(`Connection with ID ${id} not found.`);
        return null;
      }

      return connection;
    } catch (error: unknown) {
      console.error(`Error fetching connection with ID "${id}":`, error);
      throw new Error(getErrorMessage(error, 'Failed to fetch connection by ID'));
    }
  }

  async deleteConnectionById(id: number): Promise<boolean> {
    try {
      const result = await DbConnections.deleteConnectionById(id);
      if (!result) {
        console.log(`Connection with ID ${id} not found. Nothing to delete.`);
        return false;
      }

      console.log(`Connection with ID ${id} deleted successfully.`);
      return true;
    } catch (error: unknown) {
      console.error(`Error deleting connection with ID "${id}":`, error);
      throw new Error(getErrorMessage(error, 'Failed to delete connection by ID'));
    }
  }
}

export default new LoadConnections();
