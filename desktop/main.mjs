import { app, BrowserWindow, protocol, session } from 'electron'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_ROOT = resolve(__dirname, '..', 'dist')
const isDev = process.env.WISP_DEV_SERVER === '1'
const devUrl = process.env.WISP_DEV_URL || 'http://127.0.0.1:5173/?input=mouse'

// file:// 下 Chromium 会拦截 ES 模块，fetch 也读不了本地文件——而 MediaPipe 的
// wasm 和模型是运行时 fetch 的，所以打包模式不走 loadFile，而是把 dist/ 挂在
// 自定义 app:// 协议上当成真实站点。standard+secure 让 ES 模块、fetch、
// getUserMedia 在这个协议下全部按 https 的规则工作。
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/** app://dist/<path> → dist/<path>。只映射 DIST_ROOT 内部，防路径穿越。 */
async function serveDist(request) {
  try {
    const { pathname } = new URL(request.url)
    const rel = decodeURIComponent(pathname).replace(/^\/+/, '')
    const filePath = normalize(join(DIST_ROOT, rel || 'index.html'))
    if (filePath !== DIST_ROOT && !filePath.startsWith(DIST_ROOT + sep)) {
      return new Response('forbidden', { status: 403 })
    }
    const data = await readFile(filePath)
    return new Response(data, {
      headers: { 'content-type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream' },
    })
  } catch {
    return new Response('not found', { status: 404 })
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: '麦浪精灵 · Wisp Field',
    backgroundColor: '#f5efe0',
    // 先隐藏再显示：消除启动白屏闪烁
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  window.once('ready-to-show', () => window.show())

  // 开发服务器只允许本机访问；生产桌面端从 app:// 站点加载同一份 Vite 产物。
  // WISP_PROD_URL 可覆盖打包入口（如调试时直接进 app://dist/app.html?input=mouse）。
  const prodUrl = process.env.WISP_PROD_URL || 'app://dist/index.html?input=mouse'
  if (isDev) void window.loadURL(devUrl)
  else void window.loadURL(prodUrl)

  // 渲染进程日志透传到终端：现场排障不用开 DevTools 也能看到关键信息
  window.webContents.on('console-message', (event) => {
    const isError = event.level === 'error' || event.level === 3
    if (isError) console.error(`[wisp-field:renderer] ${event.message}`)
  })
  window.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error(`[wisp-field] 页面加载失败 ${code} ${desc} ${url}`)
  })
  window.webContents.on('dom-ready', () => {
    console.log(`[wisp-field] 页面 DOM 就绪: ${window.webContents.getURL()}`)
  })

  if (isDev) window.webContents.openDevTools({ mode: 'detach' })
}

app.whenReady().then(() => {
  protocol.handle('app', serveDist)

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
