import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import {
  type SavedConnection,
  type SavedConnectionInput,
  type StoredConnectionsResult,
  isSavedConnection
} from '../types.js';

class DbConnections {
  private readonly basePath: string;

  constructor() {
    this.basePath = join(homedir(), 'Documents', 'dbolt', 'connections');
  }

  async ensureDirectoryExists(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async saveConnectionsFile(newConnections: SavedConnectionInput[]): Promise<void> {
    await this.ensureDirectoryExists();
    const filePath = join(this.basePath, 'connections.json');
    const existingConnections = await this.readConnectionsFile();

    const lastId =
      existingConnections.length > 0
        ? Math.max(...existingConnections.map((connection) => connection.id))
        : 0;

    const updatedConnections: SavedConnection[] = [
      ...existingConnections,
      ...newConnections.map((connection, index) => ({
        id: lastId + index + 1,
        ...connection
      }))
    ];

    await fs.writeFile(filePath, JSON.stringify(updatedConnections, null, 2), 'utf8');
  }

  async readConnectionsFile(): Promise<StoredConnectionsResult> {
    const filePath = join(this.basePath, 'connections.json');

    try {
      const data = await fs.readFile(filePath, 'utf8');
      if (!data) {
        return [];
      }

      const parsed = JSON.parse(data) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isSavedConnection) : [];
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

  async getConnectionById(id: number): Promise<SavedConnection | null> {
    const connections = await this.readConnectionsFile();
    return connections.find((connection) => connection.id === Number(id)) ?? null;
  }

  async deleteConnectionById(id: number): Promise<boolean> {
    const connections = await this.readConnectionsFile();
    const updatedConnections = connections.filter(
      (connection) => connection.id !== Number(id)
    );

    if (connections.length === updatedConnections.length) {
      return false;
    }

    const filePath = join(this.basePath, 'connections.json');
    await fs.writeFile(filePath, JSON.stringify(updatedConnections, null, 2), 'utf8');
    return true;
  }
}

export default new DbConnections();
