import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import type { App, IpcMain, IpcMainInvokeEvent, Shell } from 'electron';

import {
  APP_UPDATE_INSTALLER_CHANNEL,
  APP_UPDATE_MANIFEST_CHANNEL,
  APP_UPDATE_PLATFORM_CHANNEL,
  APP_UPDATE_PROGRESS_CHANNEL
} from '../ipc/app-update-channels.js';

const DOWNLOADS_MANIFEST_URL = 'https://dbolt.vercel.app/downloads.json';
const REQUEST_TIMEOUT_MS = 15000;
const INSTALLER_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_REDIRECTS = 5;

export interface AppUpdateIpcOptions {
  app: App;
  ipcMain: IpcMain;
  shell: Shell;
  isTrustedRendererUrl(rawUrl: string): boolean;
}

interface InstallerPayload {
  url: string;
  fileName?: string;
  requestId: string;
}

interface InstallerLaunchResult {
  filePath: string;
}

interface InstallerProgress {
  phase: 'preparing' | 'downloading' | 'opening';
  receivedBytes: number;
  totalBytes: number | null;
  percentage: number | null;
}

type InstallerProgressReporter = (progress: InstallerProgress) => void;

type AppUpdatePlatform = 'windows' | 'linux' | 'macos' | 'unknown';

interface AppUpdatePlatformInfo {
  platform: AppUpdatePlatform;
  canOpenInstaller: boolean;
}

export function registerAppUpdateIpc(options: AppUpdateIpcOptions): void {
  const service = new ElectronAppUpdateService(options.app, options.shell);

  options.ipcMain.handle(APP_UPDATE_PLATFORM_CHANNEL, (event) => {
    assertTrustedRenderer(event, options.isTrustedRendererUrl);
    return service.getPlatformInfo();
  });

  options.ipcMain.handle(APP_UPDATE_MANIFEST_CHANNEL, async (event) => {
    assertTrustedRenderer(event, options.isTrustedRendererUrl);
    return service.getDownloadsManifest();
  });

  options.ipcMain.handle(APP_UPDATE_INSTALLER_CHANNEL, async (event, payload: unknown) => {
    assertTrustedRenderer(event, options.isTrustedRendererUrl);
    return service.downloadAndOpenInstaller(payload, (progress) => {
      if (!event.sender.isDestroyed()) {
        const requestId = isRecord(payload) && typeof payload['requestId'] === 'string'
          ? payload['requestId']
          : '';
        event.sender.send(APP_UPDATE_PROGRESS_CHANNEL, { requestId, ...progress });
      }
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function assertTrustedRenderer(
  event: IpcMainInvokeEvent,
  isTrustedRendererUrl: (rawUrl: string) => boolean
): void {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();

  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error('Untrusted renderer cannot access app update APIs.');
  }
}

class ElectronAppUpdateService {
  private readonly allowedInstallerExtensions = new Set(['.exe', '.msi', '.deb', '.rpm', '.appimage', '.dmg']);

  constructor(
    private readonly app: App,
    private readonly shell: Shell
  ) { }

  getPlatformInfo(): AppUpdatePlatformInfo {
    return {
      platform: this.getPlatform(),
      canOpenInstaller: true
    };
  }

  getDownloadsManifest(): Promise<unknown> {
    return this.requestJson(DOWNLOADS_MANIFEST_URL);
  }

  async downloadAndOpenInstaller(
    payload: unknown,
    reportProgress: InstallerProgressReporter
  ): Promise<InstallerLaunchResult> {
    const installer = this.parseInstallerPayload(payload);
    const updatesDir = path.resolve(this.app.getPath('temp'), 'dbolt-updates');
    await fs.promises.mkdir(updatesDir, { recursive: true });

    const fileName = this.resolveInstallerFileName(installer);
    const filePath = this.resolveChildPath(updatesDir, fileName);
    const partialPath = this.resolveChildPath(updatesDir, `${fileName}.download`);

    reportProgress({
      phase: 'preparing',
      receivedBytes: 0,
      totalBytes: null,
      percentage: null
    });

    try {
      await fs.promises.rm(partialPath, { force: true });
      await this.downloadFile(installer.url, partialPath, 0, reportProgress);
      await fs.promises.rm(filePath, { force: true });
      await fs.promises.rename(partialPath, filePath);
    } catch (error) {
      await fs.promises.rm(partialPath, { force: true }).catch(() => undefined);
      throw error;
    }

    const installerSize = (await fs.promises.stat(filePath)).size;
    reportProgress({
      phase: 'opening',
      receivedBytes: installerSize,
      totalBytes: installerSize,
      percentage: 100
    });

    const openError = await this.shell.openPath(filePath);
    if (openError) {
      throw new Error(openError);
    }

    return { filePath };
  }

  private getPlatform(): AppUpdatePlatform {
    if (process.platform === 'win32') {
      return 'windows';
    }

    if (process.platform === 'linux') {
      return 'linux';
    }

    if (process.platform === 'darwin') {
      return 'macos';
    }

    return 'unknown';
  }

  private parseInstallerPayload(payload: unknown): InstallerPayload {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid installer payload.');
    }

    const record = payload as Record<string, unknown>;
    const url = record['url'];
    const fileName = record['fileName'];
    const requestId = record['requestId'];

    if (typeof url !== 'string') {
      throw new Error('Installer URL is required.');
    }

    if (fileName !== undefined && typeof fileName !== 'string') {
      throw new Error('Installer file name must be a string.');
    }

    if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 128) {
      throw new Error('Installer request ID is invalid.');
    }

    this.assertTrustedInstallerUrl(url);

    return {
      url,
      fileName: typeof fileName === 'string' ? fileName : undefined,
      requestId
    };
  }

  private assertTrustedInstallerUrl(rawUrl: string): void {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw new Error('Installer URL is invalid.');
    }

    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.hostname !== 'github.com' ||
      !parsedUrl.pathname.startsWith('/ViniMacacari/dbolt/releases/download/')
    ) {
      throw new Error('Installer URL is not trusted.');
    }
  }

  private resolveInstallerFileName(installer: InstallerPayload): string {
    const urlFileName = path.basename(new URL(installer.url).pathname);
    const rawFileName = installer.fileName || urlFileName || 'dbolt-update-installer';
    const sanitizedFileName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const extension = path.extname(sanitizedFileName).toLowerCase();

    if (!sanitizedFileName || !this.allowedInstallerExtensions.has(extension)) {
      throw new Error('Installer format is not supported.');
    }

    return sanitizedFileName;
  }

  private resolveChildPath(parentDir: string, childName: string): string {
    const parentPath = path.resolve(parentDir);
    const childPath = path.resolve(parentPath, childName);
    const normalizedParent = process.platform === 'win32'
      ? parentPath.toLowerCase()
      : parentPath;
    const normalizedChild = process.platform === 'win32'
      ? childPath.toLowerCase()
      : childPath;

    if (normalizedChild !== normalizedParent && !normalizedChild.startsWith(`${normalizedParent}${path.sep}`)) {
      throw new Error('Resolved installer path is outside the updates directory.');
    }

    return childPath;
  }

  private requestJson(url: string, redirects = 0): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const request = https.get(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'DBOLT-App-Updater'
        },
        timeout: REQUEST_TIMEOUT_MS
      }, (response) => {
        let redirectUrl: string | null;
        try {
          redirectUrl = this.getRedirectUrl(url, response.statusCode, response.headers.location);
        } catch (error) {
          response.resume();
          reject(error);
          return;
        }

        if (redirectUrl) {
          response.resume();
          if (redirects >= MAX_REDIRECTS) {
            reject(new Error('Too many redirects while fetching the update manifest.'));
            return;
          }

          this.requestJson(redirectUrl, redirects + 1).then(resolve, reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Update manifest request failed with status ${response.statusCode}.`));
          return;
        }

        response.setEncoding('utf8');
        let body = '';
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      });

      request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.destroy(new Error('Update manifest request timed out.'));
      });
      request.on('error', reject);
    });
  }

  private async downloadFile(
    url: string,
    destinationPath: string,
    redirects: number,
    reportProgress: InstallerProgressReporter
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const request = https.get(url, {
        headers: {
          'User-Agent': 'DBOLT-App-Updater'
        },
        timeout: INSTALLER_TIMEOUT_MS
      }, (response) => {
        let redirectUrl: string | null;
        try {
          redirectUrl = this.getRedirectUrl(url, response.statusCode, response.headers.location);
        } catch (error) {
          response.resume();
          reject(error);
          return;
        }

        if (redirectUrl) {
          response.resume();
          if (redirects >= MAX_REDIRECTS) {
            reject(new Error('Too many redirects while downloading the installer.'));
            return;
          }

          this.downloadFile(redirectUrl, destinationPath, redirects + 1, reportProgress).then(resolve, reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Installer download failed with status ${response.statusCode}.`));
          return;
        }

        const contentLength = Number.parseInt(response.headers['content-length'] || '', 10);
        const totalBytes = Number.isFinite(contentLength) && contentLength >= 0
          ? contentLength
          : null;
        let receivedBytes = 0;
        let lastReportedAt = 0;

        const emitDownloadProgress = (force = false): void => {
          const now = Date.now();
          if (!force && now - lastReportedAt < 80) {
            return;
          }

          lastReportedAt = now;
          const percentage = totalBytes && totalBytes > 0
            ? Math.min(100, Math.round((receivedBytes / totalBytes) * 1000) / 10)
            : null;

          reportProgress({
            phase: 'downloading',
            receivedBytes,
            totalBytes,
            percentage
          });
        };

        emitDownloadProgress(true);
        response.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length;
          emitDownloadProgress();
        });

        const fileStream = fs.createWriteStream(destinationPath);
        pipeline(response, fileStream).then(() => {
          emitDownloadProgress(true);
          resolve();
        }, reject);
      });

      request.setTimeout(INSTALLER_TIMEOUT_MS, () => {
        request.destroy(new Error('Installer download timed out.'));
      });
      request.on('error', reject);
    });
  }

  private getRedirectUrl(currentUrl: string, statusCode: number | undefined, location: string | undefined): string | null {
    if (!statusCode || statusCode < 300 || statusCode >= 400 || !location) {
      return null;
    }

    const redirectUrl = new URL(location, currentUrl);

    if (redirectUrl.protocol !== 'https:') {
      throw new Error('Update redirect URL is not trusted.');
    }

    return redirectUrl.toString();
  }
}
