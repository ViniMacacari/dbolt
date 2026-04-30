import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import './api/server.js';
import { getInternalApiSessionToken } from './api/services/security/internal-session-token.js';

const { app, BrowserWindow, ipcMain } = require('electron') as typeof import('electron');
const appRoot = path.resolve(__dirname, '..');
const angularIndexPath = path.join(
  appRoot,
  'dist',
  'dbolt',
  'browser',
  'index.html'
);
const angularRendererBaseUrl = pathToFileURL(`${path.dirname(angularIndexPath)}${path.sep}`).href;
const INTERNAL_API_TOKEN_CHANNEL = 'dbolt:internal-api-token';

let win: InstanceType<typeof BrowserWindow> | null = null;

function isTrustedRendererUrl(rawUrl: string): boolean {
  try {
    const parsedUrl = new URL(rawUrl);

    if (parsedUrl.protocol === 'file:') {
      return parsedUrl.href.startsWith(angularRendererBaseUrl);
    }

    const rendererUrl = process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:4200';
    const trustedOrigins = new Set([
      new URL(rendererUrl).origin,
      'http://localhost:4200',
      'http://127.0.0.1:4200'
    ]);

    return trustedOrigins.has(parsedUrl.origin);
  } catch {
    return false;
  }
}

ipcMain.handle(INTERNAL_API_TOKEN_CHANNEL, (event) => {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();

  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error('Untrusted renderer cannot access the internal API token.');
  }

  return getInternalApiSessionToken();
});

function createWindow(): void {
  win = new BrowserWindow({
    width: 800,
    height: 655,
    minHeight: 655,
    minWidth: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true
    },
    autoHideMenuBar: true,
    resizable: true
  });

  win.setMinimumSize(800, 655);

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'] ?? undefined;

  if (rendererUrl) {
    void win.loadURL(rendererUrl);
  } else if (fs.existsSync(angularIndexPath)) {
    void win.loadFile(angularIndexPath);
  } else {
    void win.loadURL('http://localhost:4200');
  }

  win.webContents.on('did-finish-load', () => {
    win?.webContents.setZoomFactor(1.0);
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) {
      event.preventDefault();
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});
