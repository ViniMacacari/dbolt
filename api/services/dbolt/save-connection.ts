import DbConnections from '../../utils/connections.js';
import loadConnection from './load-connection.js';

import type {
  SavedConnection,
  SavedConnectionInput,
  SavedEntityResult
} from '../../types.js';

class SaveConnection {
  async newConnection(
    connection: SavedConnectionInput
  ): Promise<SavedEntityResult<SavedConnection>> {
    const existingConnections = await loadConnection.getAllConnections();

    const hasDuplicateName = existingConnections.some(
      (existingConnection) =>
        existingConnection.name.toLowerCase() === connection.name.toLowerCase()
    );

    const hasDuplicateDetails = existingConnections.some(
      (existingConnection) =>
        existingConnection.host.toLowerCase() === connection.host.toLowerCase() &&
        existingConnection.port === connection.port
    );

    if (hasDuplicateName || hasDuplicateDetails) {
      const errorMessage = hasDuplicateName
        ? 'A connection with the same name already exists.'
        : 'A connection with the same host and port already exists.';
      throw new Error(errorMessage);
    }

    const savedConnections = await DbConnections.saveConnectionsFile([connection]);
    const savedConnection = savedConnections[0];

    if (!savedConnection) {
      throw new Error('Connection was not saved.');
    }

    return {
      success: true,
      message: 'Connection saved successfully!',
      data: savedConnection
    };
  }

  async updateConnection(
    id: number,
    connection: SavedConnectionInput
  ): Promise<SavedEntityResult<SavedConnection>> {
    const existingConnections = await loadConnection.getAllConnections();

    const hasDuplicateName = existingConnections.some(
      (existingConnection) =>
        existingConnection.id !== id &&
        existingConnection.name.toLowerCase() === connection.name.toLowerCase()
    );

    const hasDuplicateDetails = existingConnections.some(
      (existingConnection) =>
        existingConnection.id !== id &&
        existingConnection.host.toLowerCase() === connection.host.toLowerCase() &&
        existingConnection.port === connection.port
    );

    if (hasDuplicateName || hasDuplicateDetails) {
      const errorMessage = hasDuplicateName
        ? 'A connection with the same name already exists.'
        : 'A connection with the same host and port already exists.';
      throw new Error(errorMessage);
    }

    const updatedConnection = await DbConnections.updateConnectionById(id, connection);

    if (!updatedConnection) {
      throw new Error('Connection was not found.');
    }

    return {
      success: true,
      message: 'Connection updated successfully!',
      data: updatedConnection
    };
  }
}

export default new SaveConnection();
