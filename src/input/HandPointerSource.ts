import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { CONFIG } from '../config'
import type { PointerSource, RawPointer } from '../types'

/**
 * 关键点索引（MediaPipe Hand Landmarker，每只手 21 点）
 *  0      腕
 *  1-4    拇指（4 = 指尖）
 *  5-8    食指（8 = 指尖）
 *  9-12   中指（9 = 掌指关节）
 *  13-16  无名指（16 = 指尖）
 *  17-20  小指（20 = 指尖）
 */
const WRIST = 0
const THUMB_TIP = 4
const INDEX_TIP = 8
const MIDDLE_MCP = 9
const PALM_RING = [WRIST, 5, MIDDLE_MCP, 13, 17]
const FINGER_TIPS = [THUMB_TIP, INDEX_TIP, 12, 16, 20]

const IDLE: RawPointer = { active: false, x: 0.5, y: 0.5, grab: 0, spread: 0.5, fresh: false }

/**
 * 不想用到的摄像头特征名。
 * 虚拟驱动：宿主软件没开时输出纯黑；
 * IR/红外：Windows Hello 红外摄像头在普通光线下采出来也是黑的——
 * "浏览器设置里能看到自己、页面上却是黑框"多半就是页面被分到了它。
 */
const AVOID_CAM = /obs|virtual|虚拟|vmix|xsplit|manycam|e2esoft|droidcam|iriun|youcam|\bir\b|红外|infrared/i

/**
 * 上次验证可用的摄像头配置（推理后端 + 分辨率），存 localStorage。
 *
 * 黑帧自动修复链跑一轮要 20 多秒——每次刷新都重跑一遍是不可接受的。
 * 记住"这台机器上什么配置能用"，下次启动直接按它开，几秒进场景。
 */
interface CamCfg {
  delegate: 'GPU' | 'CPU'
  width: number
  height: number
}

const CAM_CFG_KEY = 'wisp-cam-cfg'

function loadCamCfg(): CamCfg | null {
  try {
    const raw = localStorage.getItem(CAM_CFG_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as CamCfg
    if (v && (v.delegate === 'GPU' || v.delegate === 'CPU') && v.width > 0 && v.height > 0) return v
  } catch {
    // 隐私模式等场景下 localStorage 不可用，静默跳过
  }
  return null
}

function saveCamCfg(cfg: CamCfg): void {
  try {
    localStorage.setItem(CAM_CFG_KEY, JSON.stringify(cfg))
  } catch {
    // 同上，存不了就算了
  }
}

/**
 * 给会挂起的 Promise 加超时。
 * 最经典的现场事故：摄像头权限弹窗没人点，getUserMedia 的 Promise 永远 pending，
 * 整个启动流程就卡死在加载页——必须兜住。
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}超时（${Math.round(ms / 1000)}s）`)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

function dist2d(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

/**
 * 摄像头 + MediaPipe 手部关键点作为输入。
 *
 * 关键点：wasm 与模型全部走本地 public/ 目录（见 scripts/setup-models.mjs），
 * 现场断网也能跑。
 *
 * 如果传入了 overlay canvas，会把检测到的手部骨架（21 点 + 连线）实时画在
 * 摄像头预览上——"我的手有没有被看见、被看见了什么"，一眼就能确认。
 */
export class HandPointerSource implements PointerSource {
  readonly kind = 'hand' as const
  ready = false

  private landmarker: HandLandmarker | null = null
  private vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null
  private stream: MediaStream | null = null
  private lastTs = -1
  /** 上次推理对应的视频帧时间。渲染帧率高于摄像头帧率时跳过重复推理 */
  private lastVideoTime = -1
  private last: RawPointer = { ...IDLE }
  private ctx2d: CanvasRenderingContext2D | null = null
  /** 当前推理后端。黑帧自动修复时会从 GPU 降级到 CPU 重建 */
  private delegate: 'GPU' | 'CPU' = 'GPU'
  /**
   * 黑帧自动修复进度：0=未修 1=已换 CPU 推理 2=已降分辨率重开 3=已换设备。
   * "浏览器设置预览正常、本页黑框"在真实摄像头上的两大元凶就是
   * GPU 推理干扰解码和特定分辨率黑帧，按命中率排序逐个自动尝试。
   */
  private fixStage = 0
  /**
   * 每次 dispose / init 自增的代数。
   * 切走再切回时同一个实例会被重新 init，而挂起中的旧 init 还没死——
   * 它醒来时发现代数变了就自行退出，避免两个 init 互相践踏。
   */
  private generation = 0

  constructor(
    private readonly video: HTMLVideoElement,
    /** 启动各阶段的提示，显示在启动页上——不然"卡在哪一步"谁也说不清 */
    private readonly onStage?: (msg: string) => void,
    /** 摄像头预览上的骨架画布（可选） */
    private readonly overlay?: HTMLCanvasElement,
    /** 每次推理耗时回调：用来定位"卡"是不是 MediaPipe 推理阻塞了主线程 */
    readonly onInferMs?: (ms: number) => void,
  ) {
    // CPU 推理是默认项：GPU 委托在部分驱动上会干扰视频解码产生黑帧。
    // ?delegate=gpu 可强制 GPU 试验；上次验证可用的配置（localStorage）优先级最高
    const saved = loadCamCfg()
    const urlDelegate = new URLSearchParams(window.location.search).get('delegate')
    this.delegate = urlDelegate === 'gpu' ? 'GPU' : urlDelegate === 'cpu' ? 'CPU' : (saved?.delegate ?? 'CPU')
    // 推理分辨率由 config.pointer.inferWidth×Height 统一控制，不用缓存（避免旧高分辨率掩盖降分辨率收益）
  }

  async init(): Promise<void> {
    const gen = ++this.generation
    const stale = () => this.generation !== gen
    // 重新进入手部模式时给修复链一个新周期（推理后端保留——已经修好的不折腾）
    this.fixStage = 0
    this.fixExhausted = false

    // 模型加载和开摄像头互不依赖，并行跑，启动时间直接砍半
    this.onStage?.('正在加载手部识别模型和打开摄像头…')
    const bootModel = (async () => {
      const vision = await withTimeout(FilesetResolver.forVisionTasks('/wasm'), 15000, '加载 wasm 运行时')
      if (stale()) return
      this.vision = vision
      try {
        await this.rebuildLandmarker(this.delegate)
      } catch {
        if (stale()) return
        // 当前后端不可用（驱动/显存问题）就换另一个，别让整个输入层挂掉
        const fallback = this.delegate === 'GPU' ? 'CPU' : 'GPU'
        this.onStage?.(`${this.delegate} 不可用，改用 ${fallback} 推理…`)
        await this.rebuildLandmarker(fallback)
      }
    })()

    const bootCamera = (async () => {
      const s = await withTimeout(this.openCamera(), 25000, '打开摄像头')
      if (stale()) {
        s.getTracks().forEach((t) => t.stop())
        return
      }
      this.stream = s
      this.video.srcObject = s
    })()

    // 任一路失败就整体失败 → 上层降级鼠标；单独挂 catch 防止败者的迟到 rejection 刷屏
    bootModel.catch(() => {})
    bootCamera.catch((e) => {
      // 失败原因必须可查：NotAllowed=权限被拒 / NotFound=没摄像头 / NotReadable=被别的程序占用
      const name = e instanceof Error && 'name' in e ? (e as DOMException).name : ''
      console.error(`[wisp-field] 摄像头打开失败（${name || '未知'}）：`, e)
    })
    await Promise.all([bootModel, bootCamera])
    if (stale()) return

    this.onStage?.('正在等待摄像头画面…')
    await this.waitForVideoReady(() => stale())
    if (stale()) return

    // 骨架画布对齐视频分辨率
    if (this.overlay) {
      this.overlay.width = this.video.videoWidth || 1280
      this.overlay.height = this.video.videoHeight || 720
      this.ctx2d = this.overlay.getContext('2d')
    }

    this.onStage?.('摄像头就绪')
    this.ready = true
    this.startBlackFrameWatch()
  }

  /**
   * 打开摄像头，尽量避开虚拟设备。
   *
   * 先按默认设备请求；拿到流后发现是虚拟摄像头（OBS 等），就枚举设备换物理摄像头重试。
   * 注意：权限授予前 enumerateDevices 的 label 是空的，所以"先要权限再换设备"的顺序不能反。
   */
  private async openCamera(): Promise<MediaStream> {
    // 推理输入分辨率：永远用 config.inferWidth×Height，不依赖历史缓存。
    // 降分辨率 → MediaPipe 推理输入变小 → 耗时大幅下降（640×480 比 1280×720 快约 4 倍），
    // 反馈滞后从几十 ms 降到个位数——这是"卡"的头号来源，且缓存高分辨率会掩盖这个收益。
    // 摄像头预览框才 240px 宽，640×480 足够。
    const iw = CONFIG.pointer.inferWidth
    const ih = CONFIG.pointer.inferHeight
    const base = {
      width: { ideal: iw },
      height: { ideal: ih },
    }
    let stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', ...base }, audio: false })

    const label = stream.getVideoTracks()[0]?.label ?? ''
    if (!AVOID_CAM.test(label)) {
      const track = stream.getVideoTracks()[0]
      console.info(`[wisp-field] 摄像头已打开：${label || '（未命名设备）'}`, track?.getSettings())
      return stream
    }

    console.warn('[wisp-field] 默认摄像头可疑（', label, '），尝试换物理摄像头')
    const devices = await navigator.mediaDevices.enumerateDevices()
    const physical = devices.filter((d) => d.kind === 'videoinput' && !AVOID_CAM.test(d.label) && d.deviceId)
    for (const d of physical) {
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: d.deviceId }, ...base },
          audio: false,
        })
        stream.getTracks().forEach((t) => t.stop())
        console.info('[wisp-field] 已切换到物理摄像头：', d.label)
        return next
      } catch {
        // 这个设备打不开就试下一个
      }
    }
    console.warn('[wisp-field] 没找到更合适的物理摄像头，继续使用当前设备')
    return stream
  }

  /**
   * 黑帧看门狗：把视频缩到 16x12 每秒采样一次。
   *
   * 很多摄像头开播后要几秒才出非黑画面（自动曝光/增益爬升），3 秒就报警会误伤——
   * 所以改成"连续 10 秒全黑才报警"，报警后继续盯着，画面一旦恢复就自动撤销。
   * 事件发在 video 元素上，上层负责把提示语写出来 / 收回去。
   */
  private blackWatchTimer: number | null = null
  /** 报警后未撤回的标记（实例级：修复链会重启看门狗，恢复事件要跨重启生效） */
  private blackFired = false
  /** 修复链执行中/已用尽标记：防止报警后每秒重复触发修复 */
  private fixInFlight = false
  private fixExhausted = false

  private startBlackFrameWatch(): void {
    this.stopBlackFrameWatch()
    const w = 16
    const h = 12
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    let blackCount = 0
    this.blackWatchTimer = window.setInterval(() => {
      if (!this.ready) {
        this.stopBlackFrameWatch()
        return
      }
      if (this.video.readyState < 2 || this.video.videoWidth === 0) return
      let black = true
      try {
        ctx.drawImage(this.video, 0, 0, w, h)
        const data = ctx.getImageData(0, 0, w, h).data
        let max = 0
        for (let i = 0; i < data.length; i += 4) {
          const v = Math.max(data[i], data[i + 1], data[i + 2])
          if (v > max) max = v
        }
        black = max <= 12
      } catch {
        return
      }

      if (!black) {
        // 画面正常（或修复生效了）——记住这套可用配置，下次启动直接命中
        saveCamCfg({
          delegate: this.delegate,
          width: this.video.videoWidth || 640,
          height: this.video.videoHeight || 480,
        })
        // 之前报过警的话，撤回提示
        if (this.blackFired) {
          this.blackFired = false
          this.video.dispatchEvent(new CustomEvent('wisp-cam-alive'))
        }
        this.stopBlackFrameWatch()
        return
      }

      blackCount++
      if (blackCount >= 10 && !this.fixInFlight && !this.fixExhausted) {
        this.fixInFlight = true
        this.blackFired = true
        const label = this.stream?.getVideoTracks()[0]?.label ?? ''
        console.warn('[wisp-field] 摄像头已连续 10 秒全黑（', label, '）——尝试自动修复')
        void this.autoFixBlack()
          .then((fix) => {
            if (fix === 'none') this.fixExhausted = true
            this.video.dispatchEvent(new CustomEvent('wisp-cam-black', { detail: { label, fix } }))
          })
          .finally(() => {
            this.fixInFlight = false
          })
      }
    }, 1000)
  }

  /** 用当前设备和指定分辨率重开视频流 */
  private async reopenStream(width: number, height: number): Promise<void> {
    const deviceId = this.stream?.getVideoTracks()[0]?.getSettings().deviceId
    const video: MediaTrackConstraints = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: width }, height: { ideal: height } }
      : { facingMode: 'user', width: { ideal: width }, height: { ideal: height } }
    const s = await navigator.mediaDevices.getUserMedia({ video, audio: false })
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = s
    this.video.srcObject = s
    await this.video.play()
    this.lastVideoTime = -1
    if (this.overlay) {
      this.overlay.width = this.video.videoWidth || width
      this.overlay.height = this.video.videoHeight || height
    }
  }

  /**
   * 黑帧自动修复链：换 CPU 推理 → 降分辨率重开 → 换设备。
   * 每档只试一次（fixStage 推进），修复后重启看门狗再给 10 秒观察期。
   *
   * @returns 实际执行的修复动作，供上层提示语描述；'none' 表示用尽了
   */
  private async autoFixBlack(): Promise<'delegate' | 'resolution' | 'device' | 'none'> {
    try {
      if (this.fixStage === 0 && this.delegate === 'GPU') {
        this.fixStage = 1
        console.info('[wisp-field] 黑帧修复 1/3：改用 CPU 推理（部分机器 GPU 推理会干扰视频解码）')
        await this.rebuildLandmarker('CPU')
        this.startBlackFrameWatch()
        return 'delegate'
      }
      if (this.fixStage <= 1) {
        this.fixStage = 2
        console.info('[wisp-field] 黑帧修复 2/3：用 640x480 重新打开摄像头')
        await this.reopenStream(640, 480)
        this.startBlackFrameWatch()
        return 'resolution'
      }
      if (this.fixStage <= 2) {
        this.fixStage = 3
        const currentId = this.stream?.getVideoTracks()[0]?.getSettings().deviceId
        const list = await this.listCameras()
        const alt = list.find((d) => d.id !== currentId && d.id && !AVOID_CAM.test(d.label))
        if (alt) {
          console.info('[wisp-field] 黑帧修复 3/3：切换设备 →', alt.label)
          await this.switchCamera(alt.id)
          return 'device'
        }
      }
    } catch (e) {
      console.warn('[wisp-field] 黑帧自动修复失败：', e)
    }
    console.warn('[wisp-field] 黑帧自动修复已用尽')
    return 'none'
  }

  private stopBlackFrameWatch(): void {
    if (this.blackWatchTimer !== null) {
      window.clearInterval(this.blackWatchTimer)
      this.blackWatchTimer = null
    }
  }

  /** 列出所有视频输入设备（权限已授时 label 才有名字） */
  async listCameras(): Promise<{ id: string; label: string }[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `未知设备 ${i + 1}` }))
  }

  /** 手动切换摄像头（调试面板下拉框用）。换流、重挂 video、重启黑帧看门狗 */
  async switchCamera(deviceId: string): Promise<void> {
    const iw = CONFIG.pointer.inferWidth
    const ih = CONFIG.pointer.inferHeight
    const s = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: { ideal: iw }, height: { ideal: ih } },
      audio: false,
    })
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = s
    this.video.srcObject = s
    await this.video.play()
    this.lastVideoTime = -1
    if (this.overlay) {
      this.overlay.width = this.video.videoWidth || iw
      this.overlay.height = this.video.videoHeight || ih
    }
    console.info('[wisp-field] 已切换摄像头')
    this.startBlackFrameWatch()
  }

  /**
   * 运行时应用新的推理分辨率（CONFIG.pointer.inferWidth/Height）。
   * 分辨率只在打开摄像头时读取，调试面板改完必须重开流才生效——这里就是这个"重开"。
   */
  async applyResolution(): Promise<void> {
    if (!this.stream) return
    await this.reopenStream(CONFIG.pointer.inferWidth, CONFIG.pointer.inferHeight)
    this.startBlackFrameWatch()
  }

  /** 按 delegate 后端（重新）创建手部识别器 */
  private async rebuildLandmarker(delegate: 'GPU' | 'CPU'): Promise<void> {
    if (!this.vision) throw new Error('wasm 运行时未初始化')
    this.landmarker?.close()
    this.landmarker = null
    this.landmarker = await withTimeout(
      HandLandmarker.createFromOptions(this.vision, {
        baseOptions: { modelAssetPath: '/models/hand_landmarker.task', delegate },
        runningMode: 'VIDEO' as const,
        numHands: 1,
      }),
      20000,
      `初始化 ${delegate} 推理`,
    )
    this.delegate = delegate
  }

  /**
   * 等待摄像头真正出画面。
   *
   * video.play() 在设备被其他程序占用、虚拟驱动不出帧、隐私遮罩关闭等情况下
   * 会永远挂起——这是"卡在启动页"的头号元凶。这里统一兜底：
   * 12 秒内 readyState 没到位或没有真实分辨率就抛错，让上层降级到鼠标模式。
   */
  private async waitForVideoReady(stale: () => boolean): Promise<void> {
    try {
      await this.video.play()
    } catch (e) {
      throw new Error(`视频播放被阻止：${e instanceof Error ? e.message : String(e)}`)
    }
    if (stale()) return
    if (this.video.readyState >= 2 && this.video.videoWidth > 0) return

    await new Promise<void>((resolve, reject) => {
      const onProgress = () => {
        if (this.video.readyState >= 2 && this.video.videoWidth > 0) {
          cleanup()
          resolve()
        }
      }
      const timer = window.setTimeout(() => {
        cleanup()
        reject(new Error('等待摄像头画面超时——设备可能被其他程序占用（会议软件/OBS 等），关掉后重试'))
      }, 12000)
      const cleanup = () => {
        window.clearTimeout(timer)
        this.video.removeEventListener('playing', onProgress)
        this.video.removeEventListener('loadeddata', onProgress)
        this.video.removeEventListener('timeupdate', onProgress)
      }
      this.video.addEventListener('playing', onProgress)
      this.video.addEventListener('loadeddata', onProgress)
      this.video.addEventListener('timeupdate', onProgress)
    })
  }

  sample(now: number): RawPointer {
    if (!this.landmarker || !this.ready) return this.last
    if (this.video.readyState < 2 || this.video.videoWidth === 0) return this.last

    // 只在视频出新一帧时才推理：摄像头一般 30fps，渲染却有 60-144fps，
    // 每帧都推理是纯浪费，还会和 three.js 抢 GPU（页面闪烁的元凶之一）。
    // 同时 detectForVideo 要求时间戳严格递增，同一帧重复调用会抛错。
    const vt = this.video.currentTime
    if (vt === this.lastVideoTime || now <= this.lastTs) {
      // 无新观测：标记 fresh=false，路由器会做运动外推插值（把 30Hz 跳变补成连续轨迹）
      return { ...this.last, fresh: false }
    }
    this.lastTs = now
    this.lastVideoTime = vt

    let result
    try {
      const t0 = performance.now()
      result = this.landmarker.detectForVideo(this.video, now)
      const dtInfer = performance.now() - t0
      // 推理耗时报给上层（调试面板）。注意只在推理帧里测，non-fresh 帧不重复测
      if (this.onInferMs && dtInfer > 0.5) this.onInferMs(dtInfer)
    } catch {
      return { ...this.last, fresh: false }
    }

    const hand = result?.landmarks?.[0]
    if (!hand || hand.length < 21) {
      this.clearOverlay()
      this.last = { ...this.last, active: false, fresh: true }
      return this.last
    }

    this.drawSkeleton(hand)

    // 掌心中心比单点更稳：腕、食指根、中指根、无名指根、小指根的均值
    let px = 0
    let py = 0
    for (const i of PALM_RING) {
      px += hand[i].x
      py += hand[i].y
    }
    px /= PALM_RING.length
    py /= PALM_RING.length

    // 自拍镜像：手往右移动，屏幕上的指针也要往右，否则操作直觉是反的
    const x = 1 - px
    const y = py

    // 捏合程度：拇指尖与食指尖的距离，用手掌尺寸归一化，消除远近带来的尺度差异
    const palm = Math.max(dist2d(hand[WRIST], hand[MIDDLE_MCP]), 1e-4)
    const pinch = dist2d(hand[THUMB_TIP], hand[INDEX_TIP]) / palm
    const grab = Math.min(1, Math.max(0, 1 - (pinch - 0.35) / 0.9))

    // 张开程度：五指指尖到掌心的平均距离，同样用掌宽归一化
    let spreadSum = 0
    for (const i of FINGER_TIPS) spreadSum += Math.hypot(hand[i].x - px, hand[i].y - py)
    const spread = Math.min(1, Math.max(0, (spreadSum / FINGER_TIPS.length / palm - 0.6) / 1.1))

    this.last = { active: true, x, y, grab, spread, fresh: true }
    return this.last
  }

  /** 在摄像头预览上画手部骨架：连线 + 关节点，指尖加粗 */
  private drawSkeleton(hand: NormalizedLandmark[]): void {
    const ctx = this.ctx2d
    if (!ctx || !this.overlay) return
    const w = this.overlay.width
    const h = this.overlay.height
    ctx.clearRect(0, 0, w, h)

    ctx.strokeStyle = 'rgba(255, 217, 125, 0.95)'
    ctx.lineWidth = Math.max(2, w * 0.005)
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const c of HandLandmarker.HAND_CONNECTIONS) {
      const a = hand[c.start]
      const b = hand[c.end]
      if (!a || !b) continue
      ctx.moveTo(a.x * w, a.y * h)
      ctx.lineTo(b.x * w, b.y * h)
    }
    ctx.stroke()

    for (let i = 0; i < hand.length; i++) {
      const p = hand[i]
      const tip = (FINGER_TIPS as readonly number[]).includes(i)
      ctx.fillStyle = tip ? '#fff3c4' : 'rgba(255, 217, 125, 0.75)'
      ctx.beginPath()
      ctx.arc(p.x * w, p.y * h, Math.max(2.5, w * (tip ? 0.009 : 0.006)), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private clearOverlay(): void {
    if (!this.ctx2d || !this.overlay) return
    this.ctx2d.clearRect(0, 0, this.overlay.width, this.overlay.height)
  }

  dispose(): void {
    this.generation++
    this.stopBlackFrameWatch()
    this.landmarker?.close()
    this.landmarker = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.ready = false
    this.lastVideoTime = -1
    this.video.srcObject = null
    this.ctx2d = null
    if (this.overlay) this.overlay.width = this.overlay.width
  }
}
