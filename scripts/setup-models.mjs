/**
 * 把 MediaPipe 运行时与模型文件落到本地 public/ 目录。
 *
 * 为什么必须做这件事：
 * MediaPipe 默认从 CDN 拉 wasm 与 .task 模型。比赛现场几十支队伍抢 WiFi，
 * CDN 一慢页面直接白屏，两天就废了。这里全部本地化，断网也能跑。
 *
 * 本脚本在 postinstall 自动执行，任何一步失败都只警告、不阻断安装。
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const warn = (m) => console.warn(`[wisp-field] ${m}`)
const info = (m) => console.log(`[wisp-field] ${m}`)

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const MODEL_TARGET = join(root, 'public', 'models', 'hand_landmarker.task')
const WASM_TARGET = join(root, 'public', 'wasm')

function copyWasm() {
  const candidates = [
    join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
    join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'dist', 'wasm'),
  ]
  const src = candidates.find((p) => existsSync(p))
  if (!src) {
    warn('未找到 @mediapipe/tasks-vision 的 wasm 目录，跳过。可稍后执行 npm run setup:models')
    return false
  }
  mkdirSync(WASM_TARGET, { recursive: true })
  let n = 0
  for (const f of readdirSync(src)) {
    if (!/\.(wasm|js|ts|mjs)$/i.test(f)) continue
    const from = join(src, f)
    if (!statSync(from).isFile()) continue
    copyFileSync(from, join(WASM_TARGET, f))
    n++
  }
  info(`wasm 运行时已本地化（${n} 个文件）→ public/wasm`)
  return n > 0
}

async function downloadModel() {
  if (existsSync(MODEL_TARGET) && statSync(MODEL_TARGET).size > 1024) {
    info('手部模型已存在，跳过下载 → public/models/hand_landmarker.task')
    return true
  }
  try {
    info('正在下载手部关键点模型（约 7MB）…')
    const res = await fetch(MODEL_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1024) throw new Error('下载内容异常')
    mkdirSync(dirname(MODEL_TARGET), { recursive: true })
    writeFileSync(MODEL_TARGET, buf)
    info(`手部模型已本地化 → public/models/hand_landmarker.task（${(buf.length / 1048576).toFixed(1)} MB）`)
    return true
  } catch (e) {
    warn(`模型下载失败：${e.message}`)
    warn('可稍后联网执行 npm run setup:models，或手动下载到 public/models/hand_landmarker.task')
    warn(`下载地址：${MODEL_URL}`)
    return false
  }
}

try {
  copyWasm()
  await downloadModel()
} catch (e) {
  warn(`初始化脚本异常（不阻断）：${e.message}`)
}
process.exit(0)
