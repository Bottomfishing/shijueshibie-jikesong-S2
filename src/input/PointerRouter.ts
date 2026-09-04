import * as THREE from 'three'
import { CONFIG } from '../config'
import type { PointerSource, PointerState } from '../types'
import { OneEuroFilter, OneEuroFilter2D } from './OneEuroFilter'

/**
 * 输入路由：把手部/鼠标的原始屏幕坐标，变成场景能直接用的一份状态。
 *
 * 三件事在这里完成：
 * 1. One Euro 滤波，压掉关键点的抖动 —— 但只在"真实观测帧"上做，且用观测间隔做 dt；
 * 2. 屏幕坐标 → 世界坐标（正交相机下用 Raycaster 打水平面，比手写 unproject 稳）；
 * 3. 派生速度、能量、累计位移，供麦浪 shader 与导演消费。
 *
 * ── 为什么之前一卡一卡 ──
 * 旧实现把"速度外推"和"One Euro 滤波"叠在一起，两个问题叠加：
 *   ① 速度用渲染帧间隔(16ms)去除观测位移(33ms)，速度被高估约2倍 → 外推跑过头，被真实值拽回，就是卡顿感；
 *   ② 外推的"预测值"回头又喂进 One Euro，和下一帧真实观测打架，二次抖动。
 * 现在：观测去抖 (One Euro) 与 观测间隙补帧 (外推) 职责分离，外推值绝不再进滤波器/速度环路。
 */
export class PointerRouter {
  readonly state: PointerState = {
    active: false,
    screen: new THREE.Vector2(0.5, 0.5),
    world: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    speed: 0,
    energy: 0,
    grab: 0,
    spread: 0.5,
    lostFor: 99,
    traveled: 0,
  }

  private current: PointerSource
  private readonly posFilter: OneEuroFilter2D
  private readonly grabFilter: OneEuroFilter
  private readonly raycaster = new THREE.Raycaster()
  private readonly plane: THREE.Plane
  private readonly ndc = new THREE.Vector2()
  private readonly prevWorld = new THREE.Vector3()
  private hasWorld = false

  // ── 外推状态（只由"真实观测"更新，外推值绝不写回这些变量）──
  /** 上次真实观测的"滤波后"屏幕位置（One Euro 输出基准） */
  private readonly prevObserved = new THREE.Vector2()
  /** 由观测间隔算出的屏幕速度（单位/秒）——干净的速度，只在外推时消费 */
  private readonly screenVel = new THREE.Vector2()
  private hasPrevObserved = false
  private lastFreshAt = -1e9

  constructor(
    private readonly camera: THREE.Camera,
    private readonly primary: PointerSource,
    private readonly fallback: PointerSource,
  ) {
    this.current = primary
    const p = CONFIG.pointer.presets[CONFIG.pointer.preset] ?? CONFIG.pointer.presets['稳定']
    this.posFilter = new OneEuroFilter2D(p.minCutoff, p.beta, p.dCutoff)
    this.grabFilter = new OneEuroFilter(p.minCutoff, p.beta * 0.4)
    // 水平面 y = planeY
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CONFIG.pointer.planeY)
  }

  get activeKind(): 'hand' | 'mouse' {
    return this.current.kind
  }

  /** 优先启动手部；失败自动降级到鼠标，返回实际生效的输入源类型 */
  async init(): Promise<'hand' | 'mouse'> {
    try {
      await this.current.init()
      return this.current.kind
    } catch (e) {
      console.warn('[wisp-field] 手部输入启动失败，降级到鼠标：', e)
      // 等待期间用户可能已通过兜底按钮切到鼠标——只有还停在手部时才动输入源，
      // 否则会把正在用的鼠标源 dispose 掉
      if (this.current === this.primary) {
        this.current.dispose()
        this.current = this.fallback
      }
      if (!this.current.ready) await this.current.init()
      return this.current.kind
    }
  }

  /** 运行时手动切换输入源 */
  async switchTo(kind: 'hand' | 'mouse'): Promise<'hand' | 'mouse'> {
    const next = kind === this.primary.kind ? this.primary : this.fallback
    if (next === this.current) return kind

    this.current.dispose()
    this.current = next
    this.posFilter.reset()
    this.grabFilter.reset()
    this.hasWorld = false
    this.hasPrevObserved = false
    this.screenVel.set(0, 0)
    this.lastFreshAt = -1e9

    try {
      await this.current.init()
    } catch (e) {
      console.warn(`[wisp-field] 切换到 ${kind} 失败，退回备用输入：`, e)
      this.current = this.fallback
      if (!this.current.ready) await this.current.init()
    }
    return this.current.kind
  }

  update(dt: number, now: number): PointerState {
    const s = this.state
    const raw = this.current.sample(now)

    // ── 1. 真实观测帧：One Euro 去抖，用"观测间隔"算干净速度 ──
    //    关键：只有 fresh 帧才真正推进滤波器，非 fresh 帧不喂新样本（避免把外推/重采样当观测）
    let fx: number
    let fy: number
    if (raw.fresh) {
      const gap = Math.max(now - this.lastFreshAt, 1e-4) / 1000 // 上次观测到现在，单位秒
      const [ox, oy] = this.posFilter.filter(raw.x, raw.y, gap)
      fx = ox
      fy = oy

      // 速度用"观测间隔"算，避免用渲染帧间隔(16ms)去除观测位移(33ms)导致速度高估
      const svx = this.hasPrevObserved ? (ox - this.prevObserved.x) / gap : 0
      const svy = this.hasPrevObserved ? (oy - this.prevObserved.y) / gap : 0
      // 轻微低通，避免新观测瞬间速度量级跳变
      this.screenVel.x += (svx - this.screenVel.x) * 0.5
      this.screenVel.y += (svy - this.screenVel.y) * 0.5
      this.prevObserved.set(ox, oy)
      this.hasPrevObserved = true
      this.lastFreshAt = now
    } else {
      // 无新观测（摄像头 30fps，这帧只是缓存）
      const extrapolable =
        CONFIG.pointer.extrapolate &&
        this.hasPrevObserved &&
        raw.active &&
        now - this.lastFreshAt < CONFIG.pointer.extrapolateMaxMs
      if (extrapolable) {
        // 按干净速度把 30Hz 阶梯补成连续轨迹。绝不再回馈进速度环路/滤波器。
        fx = this.prevObserved.x + this.screenVel.x * dt
        fy = this.prevObserved.y + this.screenVel.y * dt
      } else {
        // 不满足外推条件（关掉外推 / 无基准 / 手已停）：原地停住，别漂
        fx = this.prevObserved.x
        fy = this.prevObserved.y
      }
    }

    s.screen.set(fx, fy)

    const grab = this.grabFilter.filter(raw.grab, dt)
    s.grab = raw.active ? grab : 0
    s.spread = raw.spread

    // ── 2. 屏幕 → 世界：从相机穿过该屏幕点射一条线，落到交互平面上 ──
    this.ndc.set(fx * 2 - 1, -(fy * 2 - 1))
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const hit = this.raycaster.ray.intersectPlane(this.plane, s.world)

    if (raw.active && hit) {
      if (this.hasWorld) {
        s.velocity.subVectors(s.world, this.prevWorld).divideScalar(Math.max(dt, 1e-4))
      } else {
        s.velocity.set(0, 0, 0)
        this.hasWorld = true
      }
      this.prevWorld.copy(s.world)

      s.speed = s.velocity.length()
      const move = s.speed * dt
      s.traveled += move
      s.lostFor = 0
      s.active = true
    } else {
      s.velocity.multiplyScalar(0.9)
      s.speed = s.velocity.length()
      s.lostFor += dt
      // 丢失超过阈值就判定为脱离交互，让麦浪缓缓恢复
      if (s.lostFor > CONFIG.pointer.lostTimeout) s.active = false
    }

    // ── 3. 能量：速度归一化后做时间平滑，避免瞬时抖动传导到 shader ──
    const target = Math.min(1, s.speed / 5.5)
    s.energy += (target - s.energy) * Math.min(1, dt * 5)

    return s
  }

  /** 供调试面板实时调滤波参数 */
  setFilterParams(minCutoff: number, beta: number, dCutoff: number): void {
    this.posFilter.setParams(minCutoff, beta, dCutoff)
  }

  resetTravel(): void {
    this.state.traveled = 0
  }

  dispose(): void {
    this.current.dispose()
  }
}
