import electron from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import InternalServer from './api/server.js'

const { app, BrowserWindow } = electron

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let win

function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 700,
        minHeight: 700,
        minWidth: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true,
        resizable: true
    })

    win.setMinimumSize(800, 700)

    const angularIndexPath = path.join(__dirname, 'dist/dbolt/browser/index.html')
    if (fs.existsSync(angularIndexPath)) {
        win.loadFile(angularIndexPath)
    } else {
        win.loadURL('http://localhost:4200')
    }

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