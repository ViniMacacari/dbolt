import fs from 'fs';
import path from 'path';

import './api/server.js';

const { app, BrowserWindow } = require('electron') as typeof import('electron');
const appRoot = path.resolve(__dirname, '..');

let win: InstanceType<typeof BrowserWindow> | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 800,
    height: 655,
    minHeight: 655,
    minWidth: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: false
    },
    autoHideMenuBar: true,
    resizable: true
  });

  win.setMinimumSize(800, 655);

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const angularIndexPath = path.join(
    appRoot,
    'dist',
    'dbolt',
    'browser',
    'index.html'
  );

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
