import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { CONFIG } from '../config'
import { HandPointerSource } from '../input/HandPointerSource'
import { MousePointerSource } from '../input/MousePointerSource'
import { PointerRouter } from '../input/PointerRouter'
import { StoryDirector, type Act } from '../director/StoryDirector'
import { DebugPanel } from '../ui/DebugPanel'
import { HintLayer } from '../ui/HintLayer'
import { OpsPanel } from '../ui/OpsPanel'
import { Environment } from '../world/Environment'
import { Boat } from '../world/Boat'
import { Flowers } from '../world/Flowers'
import { Crows } from '../world/Crows'
import { Girl } from '../world/Girl'
import { Pier } from '../world/Pier'
import { Pollen } from '../world/Pollen'
import { PointerCursor } from '../world/PointerCursor'
import { WheatField } from '../world/WheatField'

/**
 * 应用装配与主循环。
 *
 * 每帧的固定顺序（顺序是有讲究的）：
 *   1. 读指针（滤波 + 世界坐标）
 *   2. 光点更新（消费上一帧的精灵位置，收集判定）
 *   3. 导演推进（判断换幕，输出各系统的目标参数）
 *   4. 麦浪 / 精灵 / 环境消费导演参数
 *   5. 渲染
 */
export class App {
  readonly router: PointerRouter
  readonly director = new StoryDirector()
  readonly debug: DebugPanel

  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.OrthographicCamera
  private readonly composer: EffectComposer
  /** 类型收窄：scene.fog 联合类型用起来太啰嗦 */
  private readonly fog: THREE.Fog

  private readonly wheat: WheatField
  private readonly girl: Girl
  private readonly flowers: Flowers
  private readonly env: Environment
  private readonly crows: Crows
  private readonly pier: Pier
  private readonly boat: Boat
  private readonly cursor: PointerCursor
  /** 北延麦海生长 0~1：act3 后 3 秒长出来 */
  private northOpen = 0
  /** 抵达海边的一次性标记 */
  private seaArrived = false
  /** 帆船钩子提示的一次性标记 */
  private boatHintShown = false
  /** 航程阶段：walk=海边步行 / sailing=航行 / arrived=到岸 */
  private boatStage: 'walk' | 'sailing' | 'arrived' = 'walk'
  /** 航程过半提示的一次性标记 */
  private midwayHintShown = false
  /** 摄像机跟随系数 0~1：她走上小路后缓缓靠向她 */
  private camFollow = 0
  /** 镜头锁定跟随：她一走进北方麦田就置位，之后一直跟拍（直到重置） */
  private camLatched = false
  /** 第一章充能 0~1：起风吹散北边的雾 */
  private charge = 0
  private chapterDone = false

  private readonly clock = new THREE.Clock()
  private readonly handSource: HandPointerSource
  private readonly mouseSource: MousePointerSource
  private readonly hints = new HintLayer()
  private readonly ops = new OpsPanel()
  private readonly pollen = new Pollen()
  /** 天色：家的米白 ↔ 北方暖金 */
  private readonly skyHome = new THREE.Color(CONFIG.fog.color)
  private readonly skyNorth = new THREE.Color('#f7e8c4')
  /** 上一帧的 elapsedTime：算未钳制的真实帧间隔用 */
  private lastElapsed = 0
  private started = false
  private fpsSmooth = 60
  /** 最近一次手指推理耗时（ms）。调试面板读这个，用来定位"卡"是不是推理阻塞主线程 */
  lastInferMs = 0

  /**
   * 手势语义表（按当前输入方式给出对应说法）：
   *   指针位置 = 指引 · 挥动 = 拨麦/起风 · 张开手掌 = 加大风力 · 捏合 = 摘花
   */
  private static hintFor(act: Act, mouse: boolean): { main: string; sub?: string } {
    if (act === 1) {
      return mouse
        ? { main: '挥动鼠标，麦浪会跟着你', sub: '按住左键 = 捏合手势' }
        : { main: '挥动手掌，麦浪会跟着你', sub: '手掌位置 = 指引 · 拇指食指捏合 = 摘花' }
    }
    if (act === 2) {
      return { main: '小满醒了 —— 她会跟着你走', sub: '带她走到发光的花旁，捏合摘下三朵光' }
    }
    return { main: '麦浪向北让开了路', sub: '带着小满一路向北 —— 去看看海的尽头' }
  }

  private static readonly PICKUP_HINTS = {
    hand: '捏合手指，替小满摘下这朵花',
    mouse: '按住左键，替小满摘下这朵花',
  }

  constructor(
    container: HTMLElement,
    video: HTMLVideoElement,
    onStage?: (msg: string) => void,
    camOverlay?: HTMLCanvasElement,
  ) {
    // powerPreference 提示 Windows 双显卡笔记本用独立 GPU；
    // 默认集显时 MediaPipe 推理和渲染挤在一起，帧率抖动会表现为画面闪烁
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    // 高分屏 pixelRatio 2 的全屏 bloom 后期非常吃 GPU，1.5 的画质差异肉眼几乎看不出
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    container.appendChild(this.renderer.domElement)

    // 正交相机是纪念碑谷的灵魂，透视相机的"近大远小"会毁掉平面感
    const aspect = window.innerWidth / window.innerHeight
    const d = CONFIG.camera.frustumSize
    this.camera = new THREE.OrthographicCamera((-d * aspect) / 2, (d * aspect) / 2, d / 2, -d / 2, 0.1, 300)
    this.camera.position.set(...CONFIG.camera.position)
    this.camera.lookAt(...CONFIG.camera.target)

    this.scene.background = new THREE.Color(CONFIG.fog.color)
    this.fog = new THREE.Fog(CONFIG.fog.color, CONFIG.fog.near, CONFIG.fog.far)
    this.scene.fog = this.fog

    this.env = new Environment()
    this.scene.add(this.env.group)

    // 乌鸦：栖在枯树左上主枝梢端(crowPerch) + 一只站草地外东南麦田边（再往外推，离开树脚）
    this.crows = new Crows()
    this.crows.perchSpot.copy(this.env.crowPerch)
    this.crows.groundSpot.set(19, 0.6, -4)
    this.scene.add(this.crows.group)
    // 剪影面正对机位：一遍静态朝向，让玩家看得清鸟形（不跟着小满转，满足"乌鸦别旋转"）
    this.crows.faceDefaultCamera(new THREE.Vector3(...CONFIG.camera.position))

    this.pier = new Pier()
    this.scene.add(this.pier.group)

    // 帆船泊位：栈桥尽头外侧（栈桥终点 d≈92，w=-2.5 → 船在 w=-6.5, d≈92）
    const moorD = 92
    const moorW = -6.5
    this.boat = new Boat((moorW - moorD) * 0.7071, -(moorD + moorW) * 0.7071)
    this.scene.add(this.boat.group)

    this.scene.add(this.pollen.points)

    this.wheat = new WheatField()
    this.scene.add(this.wheat.mesh)

    this.girl = new Girl()
    this.scene.add(this.girl.group)

    this.flowers = new Flowers()
    // 花从开场就是核心玩法：先埋土，等玩家的手靠近才破土生长。
    // 不再是"第二幕才出现"的阶段性道具。
    this.flowers.setVisible(true)
    this.scene.add(this.flowers.group)

    this.cursor = new PointerCursor()
    this.scene.add(this.cursor.group)

    this.handSource = new HandPointerSource(video, onStage, camOverlay, (ms) => {
      this.lastInferMs = ms
    })
    this.mouseSource = new MousePointerSource()
    this.router = new PointerRouter(this.camera, this.handSource, this.mouseSource)

    // 高 DPI 隐患根因：renderer 用 devicePixelRatio 缩放 canvas 物理像素，
    // 而 postprocess 的 EffectComposer 目标尺寸拿的是 window.innerWidth，两者在缩放画布上不一致，
    // 会让全屏后处理方片尺寸错位 → 画面被压扁/竖闪。
    // 关键：所有后处理目标尺寸一律以 renderer 的实际绘制缓冲尺寸为准，不用 window.innerWidth/Height。
    const drawW = Math.floor(window.innerWidth * Math.min(window.devicePixelRatio, 1.5))
    const drawH = Math.floor(window.innerHeight * Math.min(window.devicePixelRatio, 1.5))

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    // 最小稳定管线：只留 RenderPass + OutputPass。
    // 画面"整屏崩溃闪/内容压成窄条"时先回退到无 bloom、无 FXAA 的基线，确认画面正常后再逐个加回。
    // 历史（09-01）定论：本机 MSAA render target 不可用；bloom/FXAA 尺寸必须用物理像素。
    // OutputPass 负责 sRGB 输出。自定义 shader 里的 colorspace_fragment 在中间 pass 是 no-op，由它统一转换
    this.composer.addPass(new OutputPass())

    this.debug = new DebugPanel(this)
    // 调试句柄：自动化测试与现场排障用
    ;(window as unknown as { __app?: App }).__app = this

    window.addEventListener('resize', this.onResize)
    window.addEventListener('keydown', this.onKey)
  }

  /** @param prefer 传 'mouse' 可跳过摄像头（?input=mouse） */
  async init(prefer: 'hand' | 'mouse' = 'hand'): Promise<'hand' | 'mouse'> {
    if (prefer === 'mouse') return this.router.switchTo('mouse')
    return this.router.init()
  }

  /** 兜底按钮专用：不管手部初始化卡在哪一步，强制切到鼠标并进场 */
  async forceMouse(): Promise<void> {
    await this.router.switchTo('mouse')
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.clock.start()
    const h = App.hintFor(1, this.router.activeKind === 'mouse')
    this.hints.show(h.main, h.sub, 8000)
    requestAnimationFrame(this.loop)
  }

  async toggleInput(): Promise<'hand' | 'mouse'> {
    return this.router.switchTo(this.router.activeKind === 'hand' ? 'mouse' : 'hand')
  }

  /** 调试面板：列出可选摄像头 */
  listCameras(): Promise<{ id: string; label: string }[]> {
    return this.handSource.listCameras()
  }

  /** 调试面板：手动切换摄像头 */
  switchCamera(deviceId: string): Promise<void> {
    return this.handSource.switchCamera(deviceId)
  }

  jumpTo(act: Act): void {
    this.director.jumpTo(act)
    this.router.resetTravel()
    // 跳幕 = 回到教学场：北扩、章节进度、镜头全部复位
    this.northOpen = 0
    this.wheat.setNorthOpen(0)
    this.girl.northOpen = 0
    this.seaArrived = false
    this.boatHintShown = false
    this.camFollow = 0
    this.camLatched = false
    this.charge = 0
    this.chapterDone = false
    this.girl.clearAutoPath()
    this.girl.paused = false
    this.girl.groundY = 0
    this.fog.far = CONFIG.fog.far
    this.fog.near = CONFIG.fog.near
    const h = App.hintFor(act, this.router.activeKind === 'mouse')
    this.hints.show(h.main, h.sub)
    if (act === 2 || act === 1 || act === 3) {
      this.flowers.reset()
      this.flowers.setVisible(true)
    }
  }

  resetStory(): void {
    this.jumpTo(1)
    this.director.reset()
  }

  private readonly loop = (): void => {
    if (!this.started) return
    requestAnimationFrame(this.loop)

    const dt = Math.min(this.clock.getDelta(), 0.05)
    // 世界级动画（北扩生长/雾带/充能/镜头收敛）用未钳制的真实时间差：
    // 低帧率下被钳制的 dt 会让这些动画慢动作化——"北边的草长不到头"就是它造成的
    const rawDt = Math.min(this.clock.elapsedTime - this.lastElapsed, 0.25)
    this.lastElapsed = this.clock.elapsedTime
    const now = performance.now()
    const time = this.clock.elapsedTime

    const pointer = this.router.update(dt, now)
    this.cursor.update(dt, time, pointer)

    // 传入手的世界坐标 handPos = pointer.world：手靠近花床才触发破土生长
    const gained = this.flowers.update(dt, time, this.girl.position, this.girl.collectAnchor, pointer.grab, pointer.world)
    if (gained > 0) this.girl.hop()
    // 站到了花旁却没捏合：教一次"怎么摘"（Flowers 内部有冷却，不会刷屏）
    if (this.flowers.pickupPrompt) {
      this.flowers.pickupPrompt = false
      const mouse = this.router.activeKind === 'mouse'
      this.hints.show(App.PICKUP_HINTS[mouse ? 'mouse' : 'hand'], undefined, 3200)
    }

    const next = this.director.update(dt, pointer, this.flowers.remaining)
    if (typeof next === 'number') {
      this.router.resetTravel()
      const h = App.hintFor(next, this.router.activeKind === 'mouse')
      this.hints.show(h.main, h.sub)
      if (next === 3) {
        // 摘完三朵花：镜头以小满为中心慢慢跟拍，北边的大麦田开始生长
        this.camLatched = true
      }
      this.girl.hop()
    }

    // 北延麦海生长动画：act3 起 1.5 秒长出来（真实时间，低帧率也保证长满），并同步给小满的活动范围
    if (this.director.act === 3 && this.northOpen < 1) {
      this.northOpen = Math.min(1, this.northOpen + rawDt / 1.5)
      this.wheat.setNorthOpen(this.northOpen)
    }
    this.girl.northOpen = this.northOpen
    this.pollen.northOpen = this.northOpen

    // 天色过渡：越往北，天光越暖
    const tint = this.northOpen * 0.55
    ;(this.scene.background as THREE.Color).copy(this.skyHome).lerp(this.skyNorth, tint)
    this.fog.color.copy(this.skyHome).lerp(this.skyNorth, tint)
    this.wheat.uniforms.uFogColor.value.copy(this.fog.color)

    // 摄像机跟随：她走进北方后镜头"锁"跟随（camLatched），不再回到全景
    const girlDepth = -(this.girl.position.x + this.girl.position.z) * 0.7071
    if (this.director.chapter === 1 || (this.northOpen > 0.95 && girlDepth > 24)) this.camLatched = true
    const wantFollow = this.camLatched ? 1 : 0
    this.camFollow += (wantFollow - this.camFollow) * Math.min(1, rawDt * 1.1)

    // 第一章"风与麦海"：走进北延麦田后——起风吹散北边的雾，雾散见海
    if (this.director.chapter === 1 && !this.chapterDone) {
      const mouse = this.router.activeKind === 'mouse'
      const windInput = mouse
        ? Math.min(1, pointer.energy * 1.7)
        : Math.min(1, Math.max(0, (pointer.spread - 0.3) / 0.55))
      if (windInput > 0.55) {
        this.charge = Math.min(1, this.charge + rawDt / CONFIG.story.chargeTime)
      } else {
        this.charge = Math.max(0, this.charge - rawDt / 2)
      }
      if (this.charge >= 1) {
        this.chapterDone = true
        this.girl.hop()
        this.hints.show('雾散了 —— 海就在前面', undefined, 6500)
      }
    }

    // 雾带：镜头锁跟随小满后，雾带整体外推——
    // 跟随镜头离她永远有 44 单位远，旧的雾带（22~70）会把她的周围永久蒙上"半雾"，
    // 表现为"中间的草又矮又灰"。外推后她身边清晰，远处才淡出。
    // 航行阶段：雾先收（雾中航行）→ 随航程放开（雾散见光的麦田）
    let fogNearWant = this.camLatched ? 48 + this.charge * 10 : CONFIG.fog.near
    let fogFarWant = this.camLatched ? 112 + this.charge * 45 : CONFIG.fog.far
    if (this.boatStage === 'sailing') {
      const s = this.boat.sailDist
      fogFarWant = s < 110 ? 130 - s * 0.3 : Math.min(175, 97 + (s - 110) * 0.35)
      fogNearWant = 58
    }
    this.fog.near += (fogNearWant - this.fog.near) * Math.min(1, rawDt * 2)
    this.fog.far += (fogFarWant - this.fog.far) * Math.min(1, rawDt * 2)
    this.wheat.setFog(this.fog.near, this.fog.far)

    // 第一章触发：北延打开后，她走进大麦田（北进深度超过 26）
    if (this.director.act === 3 && this.director.chapter === 0 && this.northOpen > 0.95) {
      if (girlDepth > 26) {
        this.director.enterChapter1()
        console.info('[wisp-field] 第一章·风与麦海 开始')
        const mouse = this.router.activeKind === 'mouse'
        this.hints.show(
          mouse ? '快速划动，掀起一阵风' : '张开手掌，起一阵风',
          '吹散北边的雾',
          7500,
        )
      }
    }

    // 抵达金色海边：走到水线附近（北进深度超过 74）
    if (this.director.chapter === 1 && !this.seaArrived) {
      if (girlDepth > 74) {
        this.seaArrived = true
        this.girl.hop()
        this.hints.show('金色海边 · 到了', '麦田的尽头，是海的开始', 8000)
      }
    }

    // 栈桥与帆船：脚下高度跟随桥面；走到船边 → 第二章钩子
    this.girl.groundY = this.pier.heightAt(this.girl.position.x, this.girl.position.z)
    if (this.seaArrived && !this.boatHintShown) {
      const dBoat = this.girl.position.distanceTo(this.boat.boatSpot)
      if (dBoat < 2.8) {
        this.boatHintShown = true
        this.boat.wake()
        this.girl.hop()
        this.hints.show('帆船已备好 —— 走到栈桥尽头登船', '海的那边，还有一片会发光的麦田', 8000)
      }
    }

    // 登船：走到船边贴上船身才登船——不是走到栈桥尽头就自动上船
    if (this.seaArrived && this.boatStage === 'walk' && girlDepth > 88) {
      const wGirl = (this.girl.position.x - this.girl.position.z) * 0.7071
      if (wGirl < -3) this.girl.groundY = Math.max(this.girl.groundY, 0.6)
      const dBoat = this.girl.position.distanceTo(this.boat.boatSpot)
      if (dBoat < 1.9) {
        this.boatStage = 'sailing'
        this.boat.depart()
        this.girl.sailing = true
        this.girl.hop()
        this.girl.externPos.copy(this.boat.deckSpot)
        this.girl.externFacing = Math.atan2(this.boat.forward.x, this.boat.forward.z)
        const mouse = this.router.activeKind === 'mouse'
        this.hints.show(
          mouse ? '按住左键，升起船帆' : '张开手掌，升起船帆',
          mouse ? '左右移动鼠标 = 掌舵方向' : '指尖左右 = 掌舵方向',
          8000,
        )
      }
    }

    // 航行：手指点向哪，船就往哪开；升帆加速
    if (this.boatStage === 'sailing') {
      this.girl.externPos.copy(this.boat.deckSpot)
      this.girl.externFacing = Math.atan2(this.boat.forward.x, this.boat.forward.z)

      // 航程过半：远方的光
      const s = this.boat.sailDist
      if (s > 170 && !this.midwayHintShown) {
        this.midwayHintShown = true
        this.hints.show('雾在散 —— 前方有光', undefined, 5000)
      }
      // 到岸：切换第二章
      if (s > 330 && this.boatStage === 'sailing') {
        this.boatStage = 'arrived'
        this.hints.show('第二章 · 到岸', '发光的麦田就在前方', 8000)
        // TODO：第二场景正式内容接入此钩子
      }
    }

    // 帆船物理与演出
    const wBoat = (this.boat.boatSpot.x - this.boat.boatSpot.z) * 0.7071
    const wPtr = (pointer.world.x - pointer.world.z) * 0.7071
    const steer = this.boatStage === 'sailing' ? Math.max(-1, Math.min(1, (wPtr - wBoat) / 12)) : 0
    const throttle = this.boatStage === 'sailing' ? (this.router.activeKind === 'mouse' ? pointer.grab : pointer.spread) : 0
    this.boat.update(dt, time, steer, throttle)

    // 张开手掌 = 起风：风力随 spread 放大（鼠标模式下划动速度快时能量自然更高）
    const wind = this.director.windScale * (pointer.active ? 0.6 + pointer.spread * 1.2 : 1)
    this.wheat.update(dt, pointer, this.director.gain, wind, this.girl.position, this.girl.speed)
    // 花让位：同步每朵花的生长状态给麦浪 shader，让已长出的花周围麦子伏倒、花和茎露出来
    this.wheat.setFlowers(this.flowers.getSpots())
    this.wheat.setWarmth(this.director.warmth)
    this.env.setWarmth(this.director.warmth)
    this.env.update(dt, time)
    // 乌鸦演出：随摘花进度推进（警觉 → 躁动 → 飞走），面朝小满
    this.crows.update(dt, time, this.flowers.collected, this.girl.position)
    this.pier.update(time)
    this.pollen.update(rawDt, time)
    this.flowers.setWarmth(Math.min(1, 0.25 + this.director.warmth))

    this.girl.setState(this.director.girlState)
    this.girl.setAppearance(this.director.warmth, this.director.girlIntensity)
    this.girl.setScale(CONFIG.girl.scale)
    this.girl.update(dt, time, pointer)

    // ── 摄像机：默认全景；锁定跟随后镜头往北多偏 9 单位——她走在画面下方，海占满上方 ──
    const north = new THREE.Vector3(-0.7071, 0, -0.7071)
    const defTarget = new THREE.Vector3(...CONFIG.camera.target)
    const followTarget = this.camLatched
      ? this.girl.position.clone().addScaledVector(north, 9)
      : this.girl.position
    const camTarget = defTarget.clone().lerp(followTarget, this.camFollow * 0.9)
    const defPos = new THREE.Vector3(...CONFIG.camera.position)
    this.camera.position.copy(defPos).add(camTarget.clone().sub(defTarget))
    this.camera.lookAt(camTarget)

    const fps = dt > 0 ? 1 / dt : 0
    this.fpsSmooth += (fps - this.fpsSmooth) * 0.05
    this.debug.updateStats(this.fpsSmooth, pointer)

    this.composer.render()
  }

  private readonly onResize = (): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    const aspect = w / h
    const d = CONFIG.camera.frustumSize
    this.camera.left = (-d * aspect) / 2
    this.camera.right = (d * aspect) / 2
    this.camera.top = d / 2
    this.camera.bottom = -d / 2
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    // combo 目标尺寸用物理像素，避免高 DPI 下后处理方片错位
    const pw = Math.floor(w * this.renderer.getPixelRatio())
    const ph = Math.floor(h * this.renderer.getPixelRatio())
    this.composer.setSize(pw, ph)
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return
    if (e.code === 'KeyD') this.debug.toggleVisible()
    if (e.code === 'KeyH') this.ops.toggle()
    if (e.code === 'KeyV') document.getElementById('cam')?.classList.toggle('visible')
    if (e.code === 'KeyR') this.resetStory()
  }

  dispose(): void {
    this.started = false
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('keydown', this.onKey)
    this.router.dispose()
    this.wheat.dispose()
    this.girl.dispose()
    this.flowers.dispose()
    this.pier.dispose()
    this.env.dispose()
    this.crows.dispose()
    this.cursor.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }
}


