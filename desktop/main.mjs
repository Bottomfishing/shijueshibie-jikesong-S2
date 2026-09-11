import { app, BrowserWindow, session } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = process.env.WISP_DEV_SERVER === '1'
const devUrl = process.env.WISP_DEV_URL || 'http://127.0.0.1:5173/?input=mouse'

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: '麦浪精灵 · Wisp Field',
    backgroundColor: '#f5efe0',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 开发服务器只允许本机访问；生产桌面端从同一份 Vite 产物加载。
  if (isDev) void window.loadURL(devUrl)
  else void window.loadFile(join(__dirname, '..', 'dist', 'index.html'), { search: 'input=mouse' })

  if (isDev) window.webContents.openDevTools({ mode: 'detach' })
}

app.whenReady().then(() => {
  // 摄像头权限由网页端的 getUserMedia 请求触发，桌面端只负责放行本应用窗口。
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
