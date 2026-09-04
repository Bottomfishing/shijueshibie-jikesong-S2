import * as THREE from 'three'
import type { PointerState } from '../types'

/**
 * 手部光标：一个跟着手走的暖色光圈。
 *
 * 对第一次上手的人几乎是必需品——没有它，用户永远在猜"我的手有没有被看见"。
 * 叙事上它还有个妙处：第一幕整个世界是冷灰的，这个光圈是画面里唯一的暖色。
 * 你的手，就是这个世界里的第一缕暖意——引导不需要一个字。
 */
export class PointerCursor {
  readonly group = new THREE.Group()

  private readonly ringA: THREE.Mesh
  private readonly ringB: THREE.Mesh
  private readonly matA: THREE.MeshBasicMaterial
  private readonly matB: THREE.MeshBasicMaterial
  private opacity = 0

  constructor() {
    const geoA = new THREE.RingGeometry(0.3, 0.36, 40)
    geoA.rotateX(-Math.PI / 2)
    const geoB = new THREE.RingGeometry(0.1, 0.15, 32)
    geoB.rotateX(-Math.PI / 2)

    const make = (color: string) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: true,
      })
    this.matA = make('#ffd97d')
    this.matB = make('#fff3c4')

    this.ringA = new THREE.Mesh(geoA, this.matA)
    this.ringB = new THREE.Mesh(geoB, this.matB)
    this.ringA.renderOrder = 4
    this.ringB.renderOrder = 4
    this.group.add(this.ringA)
    this.group.add(this.ringB)
  }

  update(dt: number, time: number, pointer: PointerState): void {
    this.group.position.set(pointer.world.x, pointer.world.y + 0.06, pointer.world.z)

    const target = pointer.active ? 0.5 + pointer.energy * 0.4 : 0
    // 出现快、消失慢：丢失瞬间不会闪烁，而是缓缓熄掉
    this.opacity += (target - this.opacity) * Math.min(1, dt * (target > this.opacity ? 10 : 4))

    // 外圈呼吸 + 捏合时放大，内圈捏合时收缩——光圈本身就是捏合手势的反馈
    this.ringA.scale.setScalar(1 + Math.sin(time * 2.4) * 0.05 + pointer.grab * 0.3)
    this.ringB.scale.setScalar(1 - pointer.grab * 0.25)
    this.matA.opacity = this.opacity * 0.55
    this.matB.opacity = this.opacity
  }

  dispose(): void {
    this.ringA.geometry.dispose()
    this.ringB.geometry.dispose()
    this.matA.dispose()
    this.matB.dispose()
  }
}
