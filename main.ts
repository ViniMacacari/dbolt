import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type { IpcMainInvokeEvent } from 'electron';

import { getInternalApiBaseUrl, internalApiReady } from './api/server.js';
import {
  INTERNAL_API_TOKEN_HEADER,
  getInternalApiSessionToken
} from './api/services/security/internal-session-token.js';
import { registerAppUpdateIpc } from './electron/services/app-update.js';

const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron') as typeof import('electron');
const appRoot = path.resolve(__dirname, '..');
const angularIndexPath = path.join(
  appRoot,
  'dist',
  'dbolt',
  'browser',
  'index.html'
);
const angularRendererBaseUrl = pathToFileURL(`${path.dirname(angularIndexPath)}${path.sep}`).href;
const INTERNAL_API_SESSION_CHANNEL = 'dbolt:internal-api-session';
const WINDOW_ACTION_CHANNEL = 'dbolt:window-action';
const WINDOW_STATE_CHANNEL = 'dbolt:window-state';
const WINDOW_STATE_CHANGED_CHANNEL = 'dbolt:window-state-changed';
const ORIGINAL_REPOSITORY_URL = 'https://github.com/ViniMacacari/dbolt';

let win: InstanceType<typeof BrowserWindow> | null = null;

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-setuid-sandbox');
}

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

ipcMain.handle(INTERNAL_API_SESSION_CHANNEL, async (event) => {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();

  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error('Untrusted renderer cannot access the internal API token.');
  }

  await internalApiReady;

  return {
    baseUrl: getInternalApiBaseUrl(),
    token: getInternalApiSessionToken(),
    tokenHeader: INTERNAL_API_TOKEN_HEADER
  };
});

function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();

  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error('Untrusted renderer cannot control the application window.');
  }
}

function getEventWindow(event: IpcMainInvokeEvent): InstanceType<typeof BrowserWindow> {
  const eventWindow = BrowserWindow.fromWebContents(event.sender);

  if (!eventWindow) {
    throw new Error('No application window is associated with this renderer.');
  }

  return eventWindow;
}

function getWindowState(targetWindow: InstanceType<typeof BrowserWindow>) {
  return {
    canToggleDevTools: !app.isPackaged,
    isFullScreen: targetWindow.isFullScreen(),
    isMaximized: targetWindow.isMaximized(),
    platform: process.platform
  };
}

function sendWindowState(targetWindow: InstanceType<typeof BrowserWindow>): void {
  if (targetWindow.isDestroyed()) {
    return;
  }

  targetWindow.webContents.send(WINDOW_STATE_CHANGED_CHANNEL, getWindowState(targetWindow));
}

ipcMain.handle(WINDOW_STATE_CHANNEL, (event) => {
  assertTrustedIpcSender(event);

  return getWindowState(getEventWindow(event));
});

ipcMain.handle(WINDOW_ACTION_CHANNEL, async (event, action: string) => {
  assertTrustedIpcSender(event);

  const targetWindow = getEventWindow(event);
  const webContents = targetWindow.webContents;

  switch (action) {
    case 'minimize':
      targetWindow.minimize();
      break;
    case 'toggle-maximize':
      if (targetWindow.isMaximized()) {
        targetWindow.unmaximize();
      } else {
        targetWindow.maximize();
      }
      break;
    case 'close':
      targetWindow.close();
      break;
    case 'quit':
      app.quit();
      break;
    case 'reload':
      webContents.reload();
      break;
    case 'force-reload':
      webContents.reloadIgnoringCache();
      break;
    case 'toggle-devtools':
      if (!app.isPackaged) {
        webContents.toggleDevTools();
      }
      break;
    case 'reset-zoom':
      webContents.setZoomLevel(0);
      break;
    case 'zoom-in':
      webContents.setZoomLevel(webContents.getZoomLevel() + 0.5);
      break;
    case 'zoom-out':
      webContents.setZoomLevel(webContents.getZoomLevel() - 0.5);
      break;
    case 'toggle-fullscreen':
      targetWindow.setFullScreen(!targetWindow.isFullScreen());
      break;
    case 'undo':
      webContents.undo();
      break;
    case 'redo':
      webContents.redo();
      break;
    case 'cut':
      webContents.cut();
      break;
    case 'copy':
      webContents.copy();
      break;
    case 'paste':
      webContents.paste();
      break;
    case 'delete':
      webContents.delete();
      break;
    case 'select-all':
      webContents.selectAll();
      break;
    case 'open-original-repository':
      await shell.openExternal(ORIGINAL_REPOSITORY_URL);
      break;
    default:
      throw new Error(`Unsupported window action: ${action}`);
  }

  return getWindowState(targetWindow);
});

registerAppUpdateIpc({
  app,
  ipcMain,
  shell,
  isTrustedRendererUrl
});

function createWindow(): void {
  Menu.setApplicationMenu(null);

  win = new BrowserWindow({
    width: 800,
    height: 655,
    minHeight: 655,
    minWidth: 800,
    backgroundColor: '#131313',
    frame: false,
    title: 'DBolt',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: !app.isPackaged
    },
    autoHideMenuBar: false,
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === ORIGINAL_REPOSITORY_URL) {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) {
      event.preventDefault();
    }
  });

  win.on('closed', () => {
    win = null;
  });

  win.on('maximize', () => win && sendWindowState(win));
  win.on('unmaximize', () => win && sendWindowState(win));
  win.on('enter-full-screen', () => win && sendWindowState(win));
  win.on('leave-full-screen', () => win && sendWindowState(win));
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
