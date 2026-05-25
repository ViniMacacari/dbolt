import { constants } from 'node:fs';
import { access, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export type SQLiteFileSystemItem = {
  name: string;
  path: string;
  type: 'directory' | 'file';
  extension: string;
};

export type SQLiteFileSystemListing = {
  currentPath: string;
  parentPath: string | null;
  roots: SQLiteFileSystemItem[];
  items: SQLiteFileSystemItem[];
};

const SQLITE_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3']);

export default class SQLiteFiles {
  static async list(targetPath?: string): Promise<SQLiteFileSystemListing> {
    const currentPath = await this.resolveDirectory(targetPath);
    const entries = await readdir(currentPath, { withFileTypes: true });
    const items: SQLiteFileSystemItem[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isFile()) {
        continue;
      }

      const entryPath = path.join(currentPath, entry.name);
      const extension = entry.isFile() ? path.extname(entry.name).toLowerCase() : '';

      if (entry.isFile() && !SQLITE_EXTENSIONS.has(extension)) {
        continue;
      }

      items.push({
        name: entry.name,
        path: entryPath,
        type: entry.isDirectory() ? 'directory' : 'file',
        extension
      });
    }

    items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });

    return {
      currentPath,
      parentPath: this.getParentPath(currentPath),
      roots: await this.listRoots(),
      items
    };
  }

  private static async resolveDirectory(targetPath?: string): Promise<string> {
    const fallbackPath = homedir();
    const requestedPath = targetPath?.trim() ? targetPath : fallbackPath;
    const resolvedPath = path.resolve(requestedPath);

    try {
      const currentStat = await stat(resolvedPath);

      if (currentStat.isDirectory()) {
        await access(resolvedPath, constants.R_OK);
        return resolvedPath;
      }

      if (currentStat.isFile()) {
        const directoryPath = path.dirname(resolvedPath);
        await access(directoryPath, constants.R_OK);
        return directoryPath;
      }
    } catch {
      const fallbackResolvedPath = path.resolve(fallbackPath);
      await access(fallbackResolvedPath, constants.R_OK);
      return fallbackResolvedPath;
    }

    return fallbackPath;
  }

  private static getParentPath(currentPath: string): string | null {
    const parentPath = path.dirname(currentPath);
    return parentPath === currentPath ? null : parentPath;
  }

  private static async listRoots(): Promise<SQLiteFileSystemItem[]> {
    if (process.platform !== 'win32') {
      const candidates = [
        '/',
        homedir(),
        '/mnt',
        '/media',
        '/run/media',
        '/Volumes'
      ];
      const roots: SQLiteFileSystemItem[] = [];
      const seen = new Set<string>();

      for (const candidate of candidates) {
        const resolvedPath = path.resolve(candidate);

        if (seen.has(resolvedPath)) {
          continue;
        }

        try {
          const candidateStat = await stat(resolvedPath);

          if (!candidateStat.isDirectory()) {
            continue;
          }

          await access(resolvedPath, constants.R_OK);
          seen.add(resolvedPath);
          roots.push({
            name: resolvedPath === homedir() ? 'Home' : resolvedPath,
            path: resolvedPath,
            type: 'directory',
            extension: ''
          });
        } catch {
          continue;
        }
      }

      return roots;
    }

    const roots: SQLiteFileSystemItem[] = [];

    for (let code = 65; code <= 90; code += 1) {
      const drive = `${String.fromCharCode(code)}:\\`;

      try {
        await access(drive, constants.R_OK);
        roots.push({
          name: drive,
          path: drive,
          type: 'directory',
          extension: ''
        });
      } catch {
        continue;
      }
    }

    return roots;
  }
}
