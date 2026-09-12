import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { CONFIG } from '../config'
import { HandPointerSource } from '../input/HandPointerSource'
import { MousePointerSource } from '../input/MousePointerSource'
import { PointerRouter } from '../input/PointerRouter'
import { DebugPanel } from '../ui/DebugPanel'
import { HintLayer } from '../ui/HintLayer'
import { OpsPanel } from '../ui/OpsPanel'
import { Girl } from '../world/Girl'
import { EraSpace } from '../world/EraSpace'
import { StoryDirector } from '../director/StoryDirector'

/**
 * 重构阶段的最小运行基线。
 *
 * 当前场景只装载小满，原有麦田、花朵、环境、乌鸦、海面、栈桥、帆船等模块
 * 均保留源码但不实例化，后续按新流程逐个接回。
 */
export class App {
  readonly router: PointerRouter
  readonly debug: DebugPanel

  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.OrthographicCamera
  private readonly composer: EffectComposer
  private readonly girl = new Girl()
  private readonly eraSpace = new EraSpace()
  private readonly director = new StoryDirector()
  private readonly clock = new THREE.Clock()
  private readonly handSource: HandPointerSource
  private readonly mouseSource: MousePointerSource
  private readonly hints = new HintLayer()
  private readonly ops = new OpsPanel()

  private started = false
  private fpsSmooth = 60
  lastInferMs = 0

  constructor(
    container: HTMLElement,
    video: HTMLVideoElement,
    onStage?: (msg: string) => void,
    camOverlay?: HTMLCanvasElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    container.appendChild(this.renderer.domElement)

    // 展厅需要读出完整空间关系，使用更远的正交镜头。
    const aspect = window.innerWidth / window.innerHeight
    const frustum = 18
    this.camera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      100,
    )
    this.camera.position.set(6, 7, 6)
    this.camera.lookAt(0, 0.45, 0)

    this.scene.background = new THREE.Color('#f5efe0')
    this.scene.add(this.eraSpace.group)
    this.scene.add(this.girl.group)
    this.girl.setState('bonded')
    this.girl.setAppearance(1, 1)
    this.girl.setScale(CONFIG.girl.scale)

    this.handSource = new HandPointerSource(video, onStage, camOverlay, (ms) => {
      this.lastInferMs = ms
    })
    this.mouseSource = new MousePointerSource()
    this.router = new PointerRouter(this.camera, this.handSource, this.mouseSource)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new OutputPass())

    this.debug = new DebugPanel(this)
    ;(window as unknown as { __app?: App }).__app = this

    window.addEventListener('resize', this.onResize)
    window.addEventListener('keydown', this.onKey)
  }

  /** @param prefer 传入 mouse 可跳过摄像头。 */
  async init(prefer: 'hand' | 'mouse' = 'hand'): Promise<'hand' | 'mouse'> {
    if (prefer === 'mouse') return this.router.switchTo('mouse')
    return this.router.init()
  }

  async forceMouse(): Promise<void> {
    await this.router.switchTo('mouse')
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.clock.start()
    this.hints.show(
      this.router.activeKind === 'mouse' ? '移动鼠标，引导奶蛙穿越网络' : '移动手掌，引导奶蛙穿越网络',
      undefined,
      5000,
    )
    requestAnimationFrame(this.loop)
  }

  async toggleInput(): Promise<'hand' | 'mouse'> {
    return this.router.switchTo(this.router.activeKind === 'hand' ? 'mouse' : 'hand')
  }

  listCameras(): Promise<{ id: string; label: string }[]> {
    return this.handSource.listCameras()
  }

  switchCamera(deviceId: string): Promise<void> {
    return this.handSource.switchCamera(deviceId)
  }

  /** 调试面板改推理分辨率后调用：重开摄像头使新分辨率生效 */
  applyInferSize(): Promise<void> {
    return this.handSource.applyResolution()
  }

  resetCharacter(): void {
    this.girl.reset()
    this.router.resetTravel()
    this.director.reset()
    this.eraSpace.setPhase('intro')
  }

  private readonly loop = (): void => {
    if (!this.started) return
    requestAnimationFrame(this.loop)

    const dt = Math.min(this.clock.getDelta(), 0.05)
    const time = this.clock.elapsedTime
    const pointer = this.router.update(dt, performance.now())

    const next = this.director.update(dt, pointer)
    if (next) this.eraSpace.setPhase(next)
    document.getElementById('transition-loading')?.classList.toggle('visible', this.director.phase === 'pullIn' || this.director.phase === 'tunnel')
    this.eraSpace.update(dt, time, pointer)

    this.girl.setState(this.director.phase === 'intro' ? 'dormant' : 'bonded')
    this.girl.setAppearance(1, 1)
    this.girl.setScale(CONFIG.girl.scale)
    this.girl.update(dt, time, pointer)

    const fps = dt > 0 ? 1 / dt : 0
    this.fpsSmooth += (fps - this.fpsSmooth) * 0.05
    this.debug.updateStats(this.fpsSmooth, pointer)
    this.composer.render()
  }

  private readonly onResize = (): void => {
    const width = window.innerWidth
    const height = window.innerHeight
    const aspect = width / height
    const frustum = 18
    this.camera.left = (-frustum * aspect) / 2
    this.camera.right = (frustum * aspect) / 2
    this.camera.top = frustum / 2
    this.camera.bottom = -frustum / 2
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
    this.composer.setSize(
      Math.floor(width * this.renderer.getPixelRatio()),
      Math.floor(height * this.renderer.getPixelRatio()),
    )
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.repeat) return
    if (event.code === 'KeyD') this.debug.toggleVisible()
    if (event.code === 'KeyH') this.ops.toggle()
    if (event.code === 'KeyV') document.getElementById('cam')?.classList.toggle('visible')
    if (event.code === 'KeyR') this.resetCharacter()
  }

  dispose(): void {
    this.started = false
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('keydown', this.onKey)
    this.router.dispose()
    this.girl.dispose()
    this.eraSpace.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }
}
