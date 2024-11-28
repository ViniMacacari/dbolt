import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let win

function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
    })

    const angularIndexPath = path.join(__dirname, 'dist/dbolt/browser/index.html')
    win.loadFile(angularIndexPath)

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