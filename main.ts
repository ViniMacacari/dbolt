// @ts-nocheck
import path from 'path'
import fs from 'fs'
import './api/server.js'

const { app, BrowserWindow } = require('electron')
const appRoot = path.resolve(__dirname, '..')

let win: Electron.BrowserWindow | null

function createWindow() {
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
    })

    win.setMinimumSize(800, 655)

    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    const angularIndexPath = path.join(appRoot, 'dist', 'dbolt', 'browser', 'index.html')

    if (rendererUrl) {
        win.loadURL(rendererUrl)
    } else if (fs.existsSync(angularIndexPath)) {
        win.loadFile(angularIndexPath)
    } else {
        win.loadURL('http://localhost:4200')
    }

    win.webContents.on('did-finish-load', () => {
        win.webContents.setZoomFactor(1.0)
    })

    win.on('closed', () => {
        win = null
    })
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (win === null) {
        createWindow()
    }
})

