import { App } from './core/App'

/**
 * 启动流程：
 * 1. file:// 协议直接拦截——双击 index.html 打开时 ES 模块根本不会执行，页面只会永远转圈；
 * 2. 加载 wasm + 手部模型（全部本地文件），打开摄像头，各阶段实时提示卡在哪一步；
 * 3. 摄像头挂了 → 自动降级鼠标模式；卡超过 8 秒 → 亮出兜底按钮，用户能自己进去；
 * 4. URL 加 ?input=mouse 可跳过摄像头直接进。
 */
async function boot(): Promise<void> {
  const bootEl = document.getElementById('boot') as HTMLElement
  const msgEl = document.getElementById('boot-msg') as HTMLElement
  const fallbackBtn = document.getElementById('boot-fallback') as HTMLButtonElement
  const video = document.getElementById('cam-video') as HTMLVideoElement
  const camCanvas = document.getElementById('cam-canvas') as HTMLCanvasElement
  const container = document.getElementById('app') as HTMLElement

  if (window.location.protocol === 'file:') {
    bootEl.classList.add('failed')
    msgEl.textContent =
      '这个页面不能双击打开（file:// 下浏览器不允许加载模块）。请在项目文件夹里运行 npm run dev，然后浏览器访问 http://localhost:5173'
    return
  }

  const params = new URLSearchParams(window.location.search)
  const forceMouse = params.get('input') === 'mouse'

  // 预览状态灯：有视频流在播才亮；否则显示具体原因，黑框装神秘最吓人
  const camEl = document.getElementById('cam') as HTMLElement
  const camHintText = document.getElementById('cam-hint-text') as HTMLElement
  const setCamHint = (t: string) => {
    if (camHintText) camHintText.textContent = t
  }
  // 非 https/localhost 的安全上下文里浏览器直接禁用 getUserMedia，
  // 用手机连局域网 IP 调试时必中——必须把原因说清楚，不然永远查不出来
  const secure = window.isSecureContext
  if (forceMouse) setCamHint('鼠标模式（URL 指定）· 面板可切回手部')
  else setCamHint(secure ? '正在打开摄像头…' : '摄像头需要 localhost 或 https（手机局域网调试会这样）')
  video.addEventListener('playing', () => camEl.classList.add('live'))
  video.addEventListener('pause', () => camEl.classList.remove('live'))
  video.addEventListener('emptied', () => camEl.classList.remove('live'))
  video.addEventListener('error', () => {
    camEl.classList.remove('live')
    setCamHint('视频流出错，已切鼠标模式')
  })
  // 黑帧看门狗：连续 10 秒全黑才报警（防慢启动误报），报警后自动按
  // 换 CPU 推理 → 降分辨率 → 换设备 的顺序修复，每档 10 秒观察期；
  // 画面一旦恢复会派发 alive 事件，提示语自动收回
  video.addEventListener('wisp-cam-black', (e) => {
    camEl.classList.remove('live')
    const d = (e as CustomEvent).detail ?? {}
    const who = d.label || '当前设备'
    if (d.fix === 'delegate') setCamHint(`「${who}」全黑——已自动改用 CPU 推理，等几秒看画面`)
    else if (d.fix === 'resolution') setCamHint(`「${who}」全黑——已用 640×480 重开摄像头，等几秒看画面`)
    else if (d.fix === 'device') setCamHint(`「${who}」全黑——已自动换设备，等几秒看画面`)
    else
      setCamHint(
        `画面全黑（${who}）——自动修复已用尽。检查镜头遮挡/滑盖；或到 chrome://settings/system 关闭硬件加速后重启浏览器再试`,
      )
  })
  video.addEventListener('wisp-cam-alive', () => {
    camEl.classList.add('live')
  })

  // 构造也可能抛错（比如某个面板控件绑定失败）——必须接住，否则页面永远停在转圈
  let app: App
  try {
    app = new App(
      container,
      video,
      (m) => {
        msgEl.textContent = m
      },
      camCanvas,
    )
  } catch (e) {
    console.error('[wisp-field] 初始化失败：', e)
    bootEl.classList.add('failed')
    msgEl.textContent = `初始化失败：${e instanceof Error ? e.message : String(e)}`
    return
  }

  let entered = false
  /** 用户点了兜底按钮：迟到的手部初始化不得再自动进场（但 enter 本身要照常执行） */
  let manualEntry = false
  const enter = () => {
    if (entered) return
    entered = true
    clearTimeout(fallbackTimer)
    fallbackBtn.hidden = true
    bootEl.classList.add('hidden')
    app.start()
  }

  // 8 秒还没进去就亮出兜底按钮——不管卡在模型、摄像头还是别的什么，用户永远有路可走
  const fallbackTimer = window.setTimeout(() => {
    if (!entered) fallbackBtn.hidden = false
  }, 8000)

  fallbackBtn.addEventListener('click', () => {
    // 注意：这里绝不能直接置 entered=true——enter() 靠这个标记判断是否已经进场，
    // 提前置位会让 .finally(enter) 变成空转，启动页永远关不上（就是这个 bug 让用户卡死在加载页）
    manualEntry = true
    fallbackBtn.disabled = true
    msgEl.textContent = '切换到鼠标模式…'
    setCamHint('鼠标模式 · 摄像头未就绪（面板可切回手部）')
    void app
      .forceMouse()
      .catch((e) => console.error('[wisp-field] 切换鼠标失败：', e))
      .finally(enter)
  })

  try {
    if (!forceMouse) msgEl.textContent = '正在加载手部识别模型…'
    const kind = await app.init(forceMouse ? 'mouse' : 'hand')

    if (kind === 'mouse') {
      // 无论走哪条路进来的，只要是鼠标模式就把提示语说清楚，别让"正在打开摄像头"永远挂着
      setCamHint('鼠标模式 · 摄像头未就绪（面板可切回手部）')
    }
    if (kind === 'mouse' && !forceMouse && !entered && !manualEntry) {
      // 摄像头没就位，但降级成功——提示一句再进，别让用户一脸懵
      msgEl.textContent = '摄像头没就位，先用鼠标模式进去看看（D 键打开调试面板可随时切回）'
      window.setTimeout(enter, 1600)
    } else {
      enter()
    }
  } catch (e) {
    clearTimeout(fallbackTimer)
    console.error('[wisp-field] 启动失败：', e)
    if (entered || manualEntry) {
      // 用户已经通过兜底按钮进场了，迟到的失败绝不能把启动页盖回正在运行的画面上
      setCamHint('摄像头未能启动 · 当前为鼠标模式（面板可切回手部）')
      return
    }
    bootEl.classList.add('failed')
    msgEl.textContent =
      e instanceof Error
        ? `启动失败：${e.message}。检查浏览器是否允许摄像头权限后刷新重试；也可以点下面的按钮先用鼠标模式进去。`
        : '启动失败，请刷新重试。'
    fallbackBtn.hidden = false
  }
}

void boot()
