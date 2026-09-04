import * as THREE from 'three'
import { CONFIG } from '../config'

/**
 * 随风的花粉：北延麦海上空漂浮的微光粒子。
 *
 * 北扩打开后它们才出现，缓缓向北飘——给"走向海边"的旅程
 * 一层空气里的流动感。粒子便宜（一个 Points），效果是氛围级的。
 */
export class Pollen {
  readonly points: THREE.Points
  private readonly vel: Float32Array
  private readonly mat: THREE.PointsMaterial
  private readonly pos: Float32Array
  private readonly count: number
  /** 北延显形 0~1，由 App 每帧同步；0 时完全透明 */
  northOpen = 0

  constructor(count = 90) {
    this.count = count
    this.pos = new Float32Array(count * 3)
    this.vel = new Float32Array(count * 3)
    const S = 0.7071
    for (let i = 0; i < count; i++) {
      const d = 12 + Math.random() * (CONFIG.sea.start + 8)
      const w = (Math.random() - 0.5) * 42
      this.pos[i * 3 + 0] = (w - d) * S
      this.pos[i * 3 + 1] = 0.5 + Math.random() * 2.2
      this.pos[i * 3 + 2] = -(d + w) * S
      // 向北飘 + 各方向一点扰动
      this.vel[i * 3 + 0] = (Math.random() - 0.5) * 0.5 - 0.35 * S
      this.vel[i * 3 + 1] = (Math.random() - 0.5) * 0.2
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.5 - 0.35 * S
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.mat = new THREE.PointsMaterial({
      color: new THREE.Color('#ffe9ad'),
      size: 0.16,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    })
    this.points = new THREE.Points(geo, this.mat)
    this.points.renderOrder = 2
    this.points.frustumCulled = false
  }

  update(dt: number, time: number): void {
    this.mat.opacity = this.northOpen * (0.34 + Math.sin(time * 1.6) * 0.16)
    if (this.northOpen <= 0.01) return
    const S = 0.7071
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3 + 0] += (this.vel[i * 3 + 0] + Math.sin(time * 0.8 + i) * 0.25) * dt
      this.pos[i * 3 + 1] += Math.sin(time * 1.1 + i * 1.7) * 0.12 * dt
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + Math.cos(time * 0.7 + i) * 0.25) * dt
      // 飘出北界或飘太高就回到南边重新来
      const d = -(this.pos[i * 3 + 0] + this.pos[i * 3 + 2]) * S
      if (d > CONFIG.sea.end + 14 || this.pos[i * 3 + 1] > 3.2 || d < 6) {
        const nd = 8 + Math.random() * 20
        const w = (Math.random() - 0.5) * 40
        this.pos[i * 3 + 0] = (w - nd) * S
        this.pos[i * 3 + 1] = 0.5 + Math.random() * 2
        this.pos[i * 3 + 2] = -(nd + w) * S
      }
    }
    ;(this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }
}
