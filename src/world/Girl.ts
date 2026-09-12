import * as THREE from 'three'
import { CONFIG } from '../config'
import type { PointerState } from '../types'

export type GirlState = 'dormant' | 'waking' | 'bonded'

const NEST = new THREE.Vector3(0, 0, 0)

function wobble(t: number, seed: number): number {
  return Math.sin(t + seed) * 0.5 + Math.sin(t * 2.3 + seed * 1.7) * 0.3 + Math.sin(t * 4.1 + seed * 3.1) * 0.2
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * 麦浪精灵的程序化角色。
 *
 * 造型依据角色三视图：无脖子的黄色水滴形身体、浅色腹部、
 * 橄榄绿外圈的大眼睛、深色手脚，以及圆润的软体轮廓。
 */
export class Girl {
  readonly group = new THREE.Group()
  readonly collectAnchor = new THREE.Vector3(0, 1, 0)
  state: GirlState = 'dormant'
  paused = false
  northOpen = 0
  groundY = 0
  sailing = false
  externPos = new THREE.Vector3()
  externFacing = 0
  pierBand: { wMin: number; wMax: number; dMin: number; dMax: number } | null = null

  private readonly figure = new THREE.Group()
  private readonly body: THREE.Mesh
  private readonly belly: THREE.Mesh
  private readonly head: THREE.Mesh
  private readonly eyeL: THREE.Mesh
  private readonly eyeR: THREE.Mesh
  private readonly pupilL: THREE.Mesh
  private readonly pupilR: THREE.Mesh
  private readonly mouth: THREE.Mesh
  private readonly armL: THREE.Group
  private readonly armR: THREE.Group
  private readonly legL: THREE.Group
  private readonly legR: THREE.Group
  private readonly bodyMat: THREE.MeshBasicMaterial
  private readonly bellyMat: THREE.MeshBasicMaterial
  private readonly shadowMat: THREE.MeshBasicMaterial
  private readonly warmBody = new THREE.Color('#f4bb32')
  private readonly coldBody = new THREE.Color('#a89f80')
  private readonly warmBelly = new THREE.Color('#f8ddb0')
  private readonly coldBelly = new THREE.Color('#d3c8aa')

  private readonly pos = new THREE.Vector3().copy(NEST)
  private readonly vel = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly accel = new THREE.Vector3()
  private readonly scratch = new THREE.Vector3()
  private facing = 0
  private bobPhase = 0
  private bobLift = 0
  private hopT = -1
  private hopLift = 0
  private wasMoving = false
  private curGroundY = 0
  private autoWaypoints: THREE.Vector3[] | null = null
  private autoIndex = 0
  private onArrive?: () => void
  private blinkTimer = 2
  private blinkAnim = -1

  constructor() {
    this.bodyMat = new THREE.MeshBasicMaterial({ color: this.warmBody.clone(), fog: true })
    this.bellyMat = new THREE.MeshBasicMaterial({ color: this.warmBelly.clone(), fog: true })
    const darkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5a4225'), fog: true })
    const eyeRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#748d5e'), fog: true })
    const blackMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#090806'), fog: true })

    // 主体：两个相交的椭球，形成无脖子、上窄下宽的软体轮廓。
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 18), this.bodyMat)
    this.body.scale.set(0.88, 1.08, 0.68)
    this.body.position.y = 0.71
    this.figure.add(this.body)

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), this.bodyMat)
    this.head.scale.set(0.98, 1.04, 0.86)
    this.head.position.set(0, 1.28, 0.02)
    this.figure.add(this.head)

    // 肩颈过渡：用同材质的圆润体块填平头部与身体之间的折线，让角色像一个连续软体。
    const shoulderBlend = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), this.bodyMat)
    shoulderBlend.scale.set(1.12, 0.64, 0.88)
    shoulderBlend.position.set(0, 1.04, 0.01)
    this.figure.add(shoulderBlend)

    // 浅色腹部：直接沿身体椭球前表面生成弧面网格，边缘不会从肚子上翘起。
    this.belly = new THREE.Mesh(this.makeBellyGeometry(), this.bellyMat)
    this.figure.add(this.belly)

    const addEye = (x: number): [THREE.Mesh, THREE.Mesh] => {
      // 眼睛仍是 2D 圆片，但圆片法线贴合头部椭球曲面，侧视时不会像一块竖直贴纸。
      const rx = 0.34 * 0.98
      const ry = 0.34 * 1.04
      const rz = 0.34 * 0.86
      const dy = 1.36 - 1.28
      const nx = x / rx
      const ny = dy / ry
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
      const normal = new THREE.Vector3(nx / rx, ny / ry, nz / rz).normalize()
      const surfaceZ = 0.02 + rz * nz
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
      const ring = new THREE.Mesh(new THREE.CircleGeometry(0.102, 24), eyeRingMat)
      ring.position.set(x, 1.36, surfaceZ + 0.002)
      ring.quaternion.copy(rotation)
      ring.renderOrder = 4
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.064, 24), blackMat)
      pupil.position.copy(ring.position).addScaledVector(normal, 0.004)
      pupil.quaternion.copy(rotation)
      pupil.renderOrder = 5
      this.figure.add(ring, pupil)
      return [ring, pupil]
    }
    ;[this.eyeL, this.pupilL] = addEye(-0.13)
    ;[this.eyeR, this.pupilR] = addEye(0.13)

    this.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.011, 0.011), darkMat)
    this.mouth.position.set(0, 1.18, 0.325)
    this.figure.add(this.mouth)

    this.legL = this.makeLeg(-1, darkMat)
    this.legR = this.makeLeg(1, darkMat)
    this.figure.add(this.legL, this.legR)
    this.armL = this.makeArm(-1, darkMat)
    this.armR = this.makeArm(1, darkMat)
    this.figure.add(this.armL, this.armR)

    this.shadowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#53462f'), transparent: true, opacity: 0.18, depthWrite: false, fog: true,
    })
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.48, 24), this.shadowMat)
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.015
    this.group.add(shadow, this.figure)
    this.group.scale.setScalar(CONFIG.girl.scale)
  }

  /** 在身体椭球的前半面铺一块椭圆腹皮，几何法线和身体曲率连续。 */
  private makeBellyGeometry(): THREE.BufferGeometry {
    const bodyRx = 0.52 * 0.88
    const bodyRy = 0.52 * 1.08
    const bodyRz = 0.52 * 0.68
    const centerY = 0.71
    const patchRx = 0.29
    const patchRy = 0.35
    const rings = 8
    const segments = 32
    const positions: number[] = [0, centerY, bodyRz + 0.008]
    const indices: number[] = []

    for (let ring = 1; ring <= rings; ring++) {
      const r = ring / rings
      for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2
        const x = patchRx * r * Math.cos(theta)
        const y = centerY + patchRy * r * Math.sin(theta)
        const normalized = (x / bodyRx) ** 2 + ((y - centerY) / bodyRy) ** 2
        const z = bodyRz * Math.sqrt(Math.max(0, 1 - normalized)) + 0.008
        positions.push(x, y, z)
      }
    }

    for (let i = 0; i < segments; i++) indices.push(0, 1 + i, 1 + ((i + 1) % segments))
    for (let ring = 1; ring < rings; ring++) {
      const current = 1 + (ring - 1) * segments
      const next = current + segments
      for (let i = 0; i < segments; i++) {
        const a = current + i
        const b = current + ((i + 1) % segments)
        const c = next + i
        const d = next + ((i + 1) % segments)
        indices.push(a, c, b, b, c, d)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }

  private makeLeg(side: -1 | 1, darkMat: THREE.Material): THREE.Group {
    const g = new THREE.Group()
    g.position.set(side * 0.13, 0.28, 0)
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.27, 5, 12), this.bodyMat)
    leg.position.y = -0.14
    g.add(leg)
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12), darkMat)
    foot.scale.set(0.86, 0.5, 1.42)
    foot.position.set(0, -0.33, 0.075)
    g.add(foot)
    for (let i = -1; i <= 1; i++) {
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), darkMat)
      toe.scale.set(1.02, 0.62, 1.12)
      toe.position.set(i * 0.052, -0.345, 0.17)
      g.add(toe)
    }
    return g
  }

  private makeArm(side: -1 | 1, darkMat: THREE.Material): THREE.Group {
    const g = new THREE.Group()
    g.position.set(side * 0.35, 0.91, 0.04)
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.26, 5, 12), this.bodyMat)
    arm.rotation.z = side * -0.72
    arm.position.set(side * -0.08, -0.15, 0.13)
    g.add(arm)
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12), darkMat)
    palm.scale.set(0.88, 0.76, 0.76)
    palm.position.set(side * -0.18, -0.28, 0.30)
    g.add(palm)
    for (let i = -1; i <= 1; i++) {
      const finger = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), darkMat)
      finger.scale.set(0.9, 0.72, 1.35)
      finger.position.set(side * (-0.23 + i * 0.046), -0.29 + i * 0.014, 0.36)
      g.add(finger)
    }
    return g
  }

  setState(state: GirlState): void { this.state = state }
  setScale(s: number): void { this.group.scale.setScalar(s) }
  hop(): void { if (this.hopT < 0) this.hopT = 0 }
  setAutoPath(waypoints: THREE.Vector3[], onArrive?: () => void): void {
    this.autoWaypoints = waypoints; this.autoIndex = 0; this.onArrive = onArrive
  }
  clearAutoPath(): void { this.autoWaypoints = null; this.onArrive = undefined }

  setAppearance(warmth: number, _intensity: number): void {
    this.bodyMat.color.copy(this.coldBody).lerp(this.warmBody, clamp(warmth, 0, 1))
    this.bellyMat.color.copy(this.coldBelly).lerp(this.warmBelly, clamp(warmth, 0, 1))
  }

  reset(): void {
    this.pos.copy(NEST); this.vel.set(0, 0, 0); this.target.copy(NEST)
    this.group.position.set(0, 0, 0); this.group.rotation.y = 0; this.figure.position.y = 0
    this.figure.rotation.x = 0; this.facing = 0; this.clearAutoPath()
    this.paused = false; this.sailing = false; this.curGroundY = 0; this.hopT = -1; this.hopLift = 0; this.bobLift = 0
  }

  private updateBlink(dt: number): void {
    this.blinkTimer -= dt
    if (this.blinkTimer <= 0 && this.blinkAnim < 0 && this.state !== 'dormant') { this.blinkAnim = 0; this.blinkTimer = 2 + Math.random() * 3 }
    if (this.blinkAnim < 0) return
    this.blinkAnim += dt / 0.14
    const eyeScale = 0.12 + 0.88 * Math.max(0, this.blinkAnim < 0.5 ? 1 - this.blinkAnim * 2 : (this.blinkAnim - 0.5) * 2)
    this.eyeL.scale.y = eyeScale; this.eyeR.scale.y = eyeScale; this.pupilL.scale.y = eyeScale; this.pupilR.scale.y = eyeScale
    if (this.blinkAnim >= 1) { this.blinkAnim = -1; this.eyeL.scale.y = 1; this.eyeR.scale.y = 1; this.pupilL.scale.y = 1; this.pupilR.scale.y = 1 }
  }

  update(dt: number, time: number, pointer: PointerState): void {
    if (this.sailing) {
      this.pos.copy(this.externPos); this.facing = this.externFacing
      this.group.rotation.y = this.facing; this.group.position.set(this.pos.x, this.groundY, this.pos.z)
      this.collectAnchor.set(this.pos.x, this.groundY + 1, this.pos.z); this.updateBlink(dt); return
    }
    if (this.autoWaypoints && !this.paused) {
      const wp = this.autoWaypoints[Math.min(this.autoIndex, this.autoWaypoints.length - 1)]
      this.target.set(wp.x, 0, wp.z)
      if (Math.hypot(this.pos.x - wp.x, this.pos.z - wp.z) < 0.8) {
        this.autoIndex++
        if (this.autoIndex >= this.autoWaypoints.length) { const cb = this.onArrive; this.clearAutoPath(); cb?.() }
      }
    } else if (this.paused) this.target.set(this.pos.x, 0, this.pos.z)
    else if (this.state === 'dormant') this.target.copy(NEST)
    else if (this.state === 'waking') {
      this.target.set(Math.cos(time * 0.16) * (CONFIG.girl.wanderAmp + 1.2), 0, Math.sin(time * 0.21) * (CONFIG.girl.wanderAmp + 1.2))
      if (pointer.active) this.target.add(this.scratch.subVectors(pointer.world, this.target).setY(0).multiplyScalar(0.55))
    } else this.target.set(pointer.world.x, 0, pointer.world.z)

    if (this.state !== 'dormant' && !this.autoWaypoints) {
      this.target.x += wobble(time * 0.24, 5.1) * CONFIG.girl.curiosityAmp
      this.target.z += wobble(time * 0.27, 9.3) * CONFIG.girl.curiosityAmp
    }
    const k = CONFIG.girl.stiffness; const c = 2 * Math.sqrt(k) * CONFIG.girl.dampingRatio
    this.accel.set(this.target.x - this.pos.x, 0, this.target.z - this.pos.z).multiplyScalar(k).addScaledVector(this.vel, -c)
    this.vel.addScaledVector(this.accel, dt)
    const maxSp = CONFIG.girl.maxSpeed * (this.state === 'bonded' ? 1.15 : 1); const sp = this.vel.length()
    if (sp > maxSp) this.vel.multiplyScalar(maxSp / sp)
    this.pos.addScaledVector(this.vel, dt)
    const speed = this.vel.length(); const moving = this.wasMoving ? speed > 0.12 : speed > 0.25; this.wasMoving = moving
    if (speed > 0.25) { const want = Math.atan2(this.vel.x, this.vel.z); let d = want - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); this.facing += d * Math.min(1, dt * CONFIG.girl.turnLerp) }
    this.group.rotation.y = this.facing; this.curGroundY += (this.groundY - this.curGroundY) * Math.min(1, dt * 6); this.group.position.set(this.pos.x, this.curGroundY, this.pos.z)
    const gait = Math.min(1, speed / 1.8); if (moving) this.bobPhase += dt * (5.2 + speed * 1.6); const s = Math.sin(this.bobPhase)
    this.legL.rotation.x = moving ? s * (0.2 + gait * 0.24) : 0; this.legR.rotation.x = moving ? -s * (0.2 + gait * 0.24) : 0
    this.armL.rotation.x = moving ? -s * (0.12 + gait * 0.2) : Math.sin(time * 1.7) * 0.02; this.armR.rotation.x = -this.armL.rotation.x
    const bobTarget = moving ? Math.abs(Math.cos(this.bobPhase)) * (0.015 + gait * 0.025) : 0; this.bobLift += (bobTarget - this.bobLift) * Math.min(1, dt * 10)
    this.figure.position.y = this.bobLift + this.hopLift; this.figure.rotation.x = moving ? 0.025 * gait : 0
    this.updateBlink(dt)
    if (this.hopT >= 0) { this.hopT += dt * 2.1; if (this.hopT >= 1) { this.hopT = -1; this.hopLift = 0 } else this.hopLift = Math.sin(this.hopT * Math.PI) * 0.2 }
    this.shadowMat.opacity = 0.18 - Math.max(0, this.figure.position.y) * 0.4
    this.collectAnchor.set(this.pos.x, this.curGroundY + 1.0 * CONFIG.girl.scale, this.pos.z)
  }

  get position(): THREE.Vector3 { return this.pos }
  get speed(): number { return this.vel.length() }
  dispose(): void {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
    this.bodyMat.dispose(); this.bellyMat.dispose(); this.shadowMat.dispose()
  }
}
