import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type { Input, IpcMainInvokeEvent } from 'electron';

import { getInternalApiBaseUrl, internalApiReady } from './api/server.js';
import {
  INTERNAL_API_TOKEN_HEADER,
  getInternalApiSessionToken
} from './api/services/security/internal-session-token.js';
import { installProcessSafetyGuards } from './api/utils/process-guards.js';
import { registerAppUpdateIpc } from './electron/services/app-update.js';

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron') as typeof import('electron');

// An unhandled error in the main process makes Electron kill the app and show
// the native "A JavaScript error occurred" dialog. Database drivers raise these
// asynchronously whenever a link drops, so they are logged and swallowed here
// to keep the window alive and let the UI report the failure on its own.
installProcessSafetyGuards();

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
const WINDOW_CLOSE_REQUESTED_CHANNEL = 'dbolt:window-close-requested';
const WINDOW_CLOSE_RESPONSE_CHANNEL = 'dbolt:window-close-response';
const DATABASE_EXPORT_PATH_CHANNEL = 'dbolt:database-export-path';
const OPENAI_OAUTH_EXTERNAL_CHANNEL = 'dbolt:openai-oauth-external';
const ORIGINAL_REPOSITORY_URL = 'https://github.com/ViniMacacari/dbolt';
const OPENAI_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_OAUTH_REDIRECT_URI = 'http://localhost:1455/auth/callback';

const RENDERER_RECOVERY_INTERVAL_MS = 10_000;

let win: InstanceType<typeof BrowserWindow> | null = null;
let lastRendererRecoveryAt = 0;
let allowWindowClose = false;
let closeRequestPending = false;
let quitAfterClose = false;

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-setuid-sandbox');
  app.commandLine.appendSwitch('disable-dev-shm-usage');
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

function isTrustedOpenAiOAuthUrl(rawUrl: string): boolean {
  try {
    const parsedUrl = new URL(rawUrl);
    return parsedUrl.origin === 'https://auth.openai.com' &&
      parsedUrl.pathname === '/oauth/authorize' &&
      parsedUrl.username === '' &&
      parsedUrl.password === '' &&
      parsedUrl.hash === '' &&
      parsedUrl.searchParams.get('client_id') === OPENAI_OAUTH_CLIENT_ID &&
      parsedUrl.searchParams.get('redirect_uri') === OPENAI_OAUTH_REDIRECT_URI &&
      parsedUrl.searchParams.get('response_type') === 'code' &&
      parsedUrl.searchParams.get('code_challenge_method') === 'S256' &&
      Boolean(parsedUrl.searchParams.get('code_challenge')) &&
      Boolean(parsedUrl.searchParams.get('state'));
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
    isFullScreen: targetWindow.isFullScreen(),
    isMaximized: targetWindow.isMaximized(),
    platform: process.platform
  };
}

function isBlockedBrowserShortcut(input: Input): boolean {
  if (input.type !== 'keyDown') {
    return false;
  }

  const key = input.key.toLowerCase();
  const ctrlOrMeta = input.control || input.meta;

  return key === 'f5' ||
    key === 'f12' ||
    (ctrlOrMeta && key === 'r') ||
    (ctrlOrMeta && input.shift && ['i', 'j', 'c'].includes(key));
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

ipcMain.handle(DATABASE_EXPORT_PATH_CHANNEL, async (event, suggestedFileName: string) => {
  assertTrustedIpcSender(event);

  const safeFileName = path.basename(String(suggestedFileName || 'dbolt-export.sql'))
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\.+$/g, '') || 'dbolt-export.sql';
  const normalizedFileName = safeFileName.toLowerCase().endsWith('.sql')
    ? safeFileName
    : `${safeFileName}.sql`;
  const result = await dialog.showSaveDialog(getEventWindow(event), {
    title: 'DBolt - Database Export',
    defaultPath: path.join(app.getPath('documents'), normalizedFileName),
    filters: [
      { name: 'SQL', extensions: ['sql'] }
    ],
    properties: ['createDirectory', 'showOverwriteConfirmation']
  });

  return {
    canceled: result.canceled,
    filePath: result.filePath || null
  };
});

ipcMain.handle(OPENAI_OAUTH_EXTERNAL_CHANNEL, async (event, authorizationUrl: string) => {
  assertTrustedIpcSender(event);

  if (!isTrustedOpenAiOAuthUrl(String(authorizationUrl || ''))) {
    throw new Error('Invalid OpenAI OAuth authorization URL.');
  }

  await shell.openExternal(authorizationUrl);
});

ipcMain.handle(WINDOW_CLOSE_RESPONSE_CHANNEL, (event, shouldClose: boolean) => {
  assertTrustedIpcSender(event);

  if (typeof shouldClose !== 'boolean') {
    throw new Error('The window close response must be a boolean.');
  }

  const targetWindow = getEventWindow(event);
  closeRequestPending = false;

  if (!shouldClose) {
    quitAfterClose = false;
    return;
  }

  allowWindowClose = true;

  if (quitAfterClose) {
    app.quit();
  } else {
    targetWindow.close();
  }
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
      quitAfterClose = true;
      targetWindow.close();
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
  allowWindowClose = false;
  closeRequestPending = false;
  quitAfterClose = false;

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
      devTools: false
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

  win.webContents.on('before-input-event', (event, input) => {
    if (isBlockedBrowserShortcut(input)) {
      event.preventDefault();
    }
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

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('The application window stopped responding:', details);

    if (details.reason === 'clean-exit' || !win || win.isDestroyed()) {
      return;
    }

    // Reload once per interval so a page that crashes while loading does not
    // turn the recovery into a reload loop.
    const now = Date.now();
    if (now - lastRendererRecoveryAt < RENDERER_RECOVERY_INTERVAL_MS) {
      console.error('Skipping the window reload because it just crashed again.');
      return;
    }

    lastRendererRecoveryAt = now;
    win.webContents.reloadIgnoringCache();
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) {
      return;
    }

    console.error(`Failed to load ${validatedUrl}: ${errorDescription} (${errorCode})`);
  });

  win.on('unresponsive', () => {
    console.warn('The application window is busy and stopped painting.');
  });

  win.on('responsive', () => {
    console.log('The application window is responsive again.');
  });

  win.on('closed', () => {
    win = null;
  });

  win.on('close', (event) => {
    if (allowWindowClose) {
      return;
    }

    event.preventDefault();

    if (closeRequestPending || !win || win.isDestroyed()) {
      return;
    }

    closeRequestPending = true;
    win.webContents.send(WINDOW_CLOSE_REQUESTED_CHANNEL);
  });

  win.on('maximize', () => win && sendWindowState(win));
  win.on('unmaximize', () => win && sendWindowState(win));
  win.on('enter-full-screen', () => win && sendWindowState(win));
  win.on('leave-full-screen', () => win && sendWindowState(win));
}

app.on('ready', createWindow);

app.on('before-quit', () => {
  if (!allowWindowClose) {
    quitAfterClose = true;
  }
});

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
