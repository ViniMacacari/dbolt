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

type SavedConnectionSummary = Omit<SavedConnection, 'password'>;

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
    const existingConnections = await this.readStoredConnectionsFile();

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
    const storedConnections = await this.readStoredConnectionsFile();
    const decryptedConnections = await this.decryptConnections(storedConnections);

    if (this.hasLegacyPasswords(storedConnections)) {
      await this.writeConnectionsFile(storedConnections);
    }

    return decryptedConnections;
  }

  async getConnectionSummaries(): Promise<SavedConnectionSummary[]> {
    const storedConnections = await this.readStoredConnectionsFile();

    if (this.hasLegacyPasswords(storedConnections)) {
      await this.writeConnectionsFile(storedConnections);
    }

    return storedConnections.map(({ password: _password, ...connection }) => connection);
  }

  async getConnectionById(id: number): Promise<SavedConnection | null> {
    const connections = await this.readStoredConnectionsFile();
    const connection = connections.find((item) => item.id === Number(id)) ?? null;

    if (!connection) {
      return null;
    }

    if (this.hasLegacyPasswords(connections)) {
      await this.writeConnectionsFile(connections);
    }

    const decryptedConnections = await this.decryptConnections([connection]);
    return decryptedConnections[0] ?? null;
  }

  async deleteConnectionById(id: number): Promise<boolean> {
    const connections = await this.readStoredConnectionsFile();
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
    const connections = await this.readStoredConnectionsFile();
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

  private async readStoredConnectionsFile(): Promise<StoredConnectionsResult> {
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
      return storedConnections;
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
    const passwords = await SecureStorage.decryptStrings(
      connections.map((connection) => connection.password)
    );

    return connections.map((connection, index) => ({
      ...connection,
      password: passwords[index] ?? connection.password
    }));
  }

  private hasLegacyPasswords(connections: SavedConnection[]): boolean {
    return connections.some(
      (connection) => !SecureStorage.isEncrypted(connection.password)
    );
  }

  private async encryptConnections(
    connections: SavedConnection[]
  ): Promise<SavedConnection[]> {
    const encryptedConnections = connections.map((connection) => ({
      ...connection
    }));
    const plaintextIndexes: number[] = [];
    const plaintextPasswords: string[] = [];

    encryptedConnections.forEach((connection, index) => {
      if (SecureStorage.isEncrypted(connection.password)) {
        return;
      }

      plaintextIndexes.push(index);
      plaintextPasswords.push(connection.password);
    });

    const encryptedPasswords = await SecureStorage.encryptStrings(plaintextPasswords);

    encryptedPasswords.forEach((password, resultIndex) => {
      const connectionIndex = plaintextIndexes[resultIndex];

      if (connectionIndex === undefined) {
        return;
      }

      encryptedConnections[connectionIndex].password = password;
    });

    return encryptedConnections;
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
