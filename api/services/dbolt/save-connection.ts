import DbConnections from '../../utils/connections.js';
import loadConnection from './load-connection.js';

import type {
  ConnectionServiceResult,
  SavedConnectionInput
} from '../../types.js';

class SaveConnection {
  async newConnection(
    connection: SavedConnectionInput
  ): Promise<ConnectionServiceResult> {
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

    await DbConnections.saveConnectionsFile([connection]);

    return { success: true, message: 'Connection saved successfully!' };
  }
}

export default new SaveConnection();
