import { app, BrowserWindow, session } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const dev = process.env.WISP_DEV_SERVER === '1'
const devUrl = process.env.WISP_DEV_URL || 'http://127.0.0.1:5174/?input=mouse'

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: '麦浪精灵 · Wisp Field',
    backgroundColor: '#f5efe0',
    autoHideMenuBar: true,
    webPreferences: { preload: join(root, 'preload.mjs'), contextIsolation: true, nodeIntegration: false },
  })
  if (dev) void window.loadURL(devUrl)
  else void window.loadFile(join(root, '..', 'dist', 'index.html'), { search: 'input=mouse' })
  if (dev) window.webContents.openDevTools({ mode: 'detach' })
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'media'))
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
