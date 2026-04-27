import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import {
  type SavedConnection,
  type SavedConnectionInput,
  type StoredConnectionsResult,
  isSavedConnection
} from '../types.js';
import SecureStorage from '../services/dbolt/secure-storage.js';

const CONNECTIONS_FILENAME = 'connections.json';
const TEMP_FILENAME = `${CONNECTIONS_FILENAME}.tmp`;
const BACKUP_FILENAME = `${CONNECTIONS_FILENAME}.bak`;

class DbConnections {
  private readonly basePath: string;

  constructor() {
    this.basePath = join(homedir(), 'Documents', 'dbolt', 'connections');
  }

  async ensureDirectoryExists(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async saveConnectionsFile(newConnections: SavedConnectionInput[]): Promise<SavedConnection[]> {
    await this.ensureDirectoryExists();
    const existingConnections = await this.readConnectionsFile();

    const lastId =
      existingConnections.length > 0
        ? Math.max(...existingConnections.map((connection) => connection.id))
        : 0;

    const savedConnections: SavedConnection[] = newConnections.map((connection, index) => ({
      id: lastId + index + 1,
      ...connection
    }));

    const updatedConnections: SavedConnection[] = [
      ...existingConnections,
      ...savedConnections
    ];

    await this.writeConnectionsFile(updatedConnections);

    return savedConnections;
  }

  async readConnectionsFile(): Promise<StoredConnectionsResult> {
    await this.ensureDirectoryExists();
    await this.restoreBackupIfNeeded();
    const filePath = this.getConnectionsFilePath();

    try {
      const data = await fs.readFile(filePath, 'utf8');
      if (!data) {
        return [];
      }

      const parsed = JSON.parse(data) as unknown;
      const storedConnections = Array.isArray(parsed)
        ? parsed.filter(isSavedConnection)
        : [];
      const decryptedConnections = await this.decryptConnections(storedConnections);

      if (this.hasLegacyPasswords(storedConnections)) {
        await this.writeConnectionsFile(decryptedConnections);
      }

      return decryptedConnections;
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

    await this.writeConnectionsFile(updatedConnections);
    return true;
  }

  async updateConnectionById(
    id: number,
    connectionData: SavedConnectionInput
  ): Promise<SavedConnection | null> {
    const connections = await this.readConnectionsFile();
    const connectionIndex = connections.findIndex(
      (connection) => connection.id === Number(id)
    );

    if (connectionIndex === -1) {
      return null;
    }

    const updatedConnection: SavedConnection = {
      id: Number(id),
      ...connectionData
    };

    const updatedConnections = connections.map((connection, index) =>
      index === connectionIndex ? updatedConnection : connection
    );

    await this.writeConnectionsFile(updatedConnections);

    return updatedConnection;
  }

  private getConnectionsFilePath(): string {
    return join(this.basePath, CONNECTIONS_FILENAME);
  }

  private getTempFilePath(): string {
    return join(this.basePath, TEMP_FILENAME);
  }

  private getBackupFilePath(): string {
    return join(this.basePath, BACKUP_FILENAME);
  }

  private async decryptConnections(
    connections: SavedConnection[]
  ): Promise<SavedConnection[]> {
    return Promise.all(
      connections.map(async (connection) => ({
        ...connection,
        password: await SecureStorage.decryptString(connection.password)
      }))
    );
  }

  private hasLegacyPasswords(connections: SavedConnection[]): boolean {
    return connections.some(
      (connection) => !SecureStorage.isEncrypted(connection.password)
    );
  }

  private async encryptConnections(
    connections: SavedConnection[]
  ): Promise<SavedConnection[]> {
    return Promise.all(
      connections.map(async (connection) => ({
        ...connection,
        password: await SecureStorage.encryptString(connection.password)
      }))
    );
  }

  private async writeConnectionsFile(
    connections: SavedConnection[]
  ): Promise<void> {
    await this.ensureDirectoryExists();

    const filePath = this.getConnectionsFilePath();
    const tempFilePath = this.getTempFilePath();
    const backupFilePath = this.getBackupFilePath();
    const encryptedConnections = await this.encryptConnections(connections);
    const payload = JSON.stringify(encryptedConnections, null, 2);

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

  private async restoreBackupIfNeeded(): Promise<void> {
    const filePath = this.getConnectionsFilePath();
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
    const filePath = this.getConnectionsFilePath();
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

export default new DbConnections();
