import * as THREE from 'three'
import haloFrag from '../shaders/halo.frag.glsl?raw'
import haloVert from '../shaders/halo.vert.glsl?raw'

/**
 * 木栈桥：从沙滩伸入海中的木质码头。纪念碑谷式几何体，强调立体与剪影。
 *
 * 厚桥面 + 板缝 + 两侧纵梁 + 栏杆扶手 + 木桩入水 + 两盏灯笼柱。
 * 小满可以走上去（heightAt 提供桥面高度，身体高度平滑过渡）。
 * 栈桥尽头停着小帆船（Boat 类）——通往第二章。
 */
export class Pier {
  readonly group = new THREE.Group()

  private readonly deckMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#a8845c'), fog: true })
  private readonly seamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#6e5439'), fog: true })
  private readonly beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8a6a48'), fog: true })
  private readonly poleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7d6244'), fog: true })
  private readonly lampMats: THREE.ShaderMaterial[] = []

  constructor() {
    const S = 0.7071
    // 栈桥起点（w=-2.5, d=74），沿正北伸入海中；本地 +z 指向正北
    const startD = 74
    const startW = -2.5
    this.group.position.set((startW - startD) * S, 0, -(startD + startW) * S)
    this.group.rotation.y = -Math.PI * 0.75

    // ── 厚桥面（有体积，侧面也是面）；整体抬高避开浪峰（海浪最高约 0.52） ──
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 20), this.deckMat)
    deck.position.set(0, 0.62, 10)
    this.group.add(deck)
    // 板缝：嵌在桥面上的深色细条
    for (let i = 0; i < 10; i++) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.03, 0.12), this.seamMat)
      seam.position.set(0, 0.685, 1 + i * 2)
      this.group.add(seam)
    }
    // 两侧纵梁：桥侧面的结构线
    for (const xx of [-1.1, 1.1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 20), this.beamMat)
      beam.position.set(xx, 0.52, 10)
      this.group.add(beam)
    }
    // 入口平台：沙滩上的起步小平台
    const entry = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 1.6), this.deckMat)
    entry.position.set(0, 0.06, -0.4)
    this.group.add(entry)

    // ── 栏杆：立柱 + 扶手，立体感的关键 ──
    const postGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.5, 6)
    for (let z = 2; z <= 18; z += 4) {
      for (const xx of [-1.05, 1.05]) {
        const post = new THREE.Mesh(postGeo, this.poleMat)
        post.position.set(xx, 0.94, z)
        this.group.add(post)
      }
    }
    for (const xx of [-1.05, 1.05]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 20), this.beamMat)
      rail.position.set(xx, 1.16, 10)
      this.group.add(rail)
    }

    // ── 木桩入水：微微歪斜才有手作感 ──
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 2.0, 8)
    for (const zz of [3, 8, 13, 18]) {
      for (const xx of [-0.95, 0.95]) {
        const pole = new THREE.Mesh(poleGeo, this.poleMat)
        pole.position.set(xx, 0.05, zz)
        pole.rotation.z = (Math.random() - 0.5) * 0.06
        pole.rotation.x = (Math.random() - 0.5) * 0.06
        this.group.add(pole)
      }
    }

    // ── 灯笼柱：入口与尽头各一盏，暖光呼吸——夜色里的方向指引 ──
    for (const zz of [1.5, 18.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 8), this.poleMat)
      post.position.set(1.15, 1.44, zz)
      this.group.add(post)
      const lampMat = new THREE.ShaderMaterial({
        vertexShader: haloVert,
        fragmentShader: haloFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: new THREE.Color('#ffd97d') },
          uOpacity: { value: 0.5 },
          uPower: { value: 2.2 },
        },
      })
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), lampMat)
      lamp.position.set(1.15, 2.24, zz)
      this.group.add(lamp)
      this.lampMats.push(lampMat)
    }
  }

  /** 桥面高度：在栈桥范围内返回桥面高（入口有缓坡），否则 0（沙滩/海面） */
  heightAt(x: number, z: number): number {
    const relX = x - this.group.position.x
    const relZ = z - this.group.position.z
    // 本地坐标：z 沿栈桥向北，x 横向
    const lz = -(relX * 0.7071 + relZ * 0.7071)
    const lx = relX * 0.7071 - relZ * 0.7071
    if (lz < 0.2 || lz > 20.3 || Math.abs(lx) > 1.35) return 0
    // 入口缓坡：从沙滩 0 平滑升到桥面
    return 0.69 * (0.12 + 0.88 * Math.min(1, lz / 5))
  }

  /** 每帧节拍：灯笼呼吸 */
  update(time: number): void {
    for (let i = 0; i < this.lampMats.length; i++) {
      const m = this.lampMats[i]
      const base = i === this.lampMats.length - 1 ? 0.55 : 0.4
      m.uniforms.uOpacity.value = base + Math.sin(time * 1.7 + i * 1.3) * 0.12
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) m.dispose()
      }
    })
  }
}
