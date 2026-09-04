import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CONFIG } from '../config'
import type { PointerState } from '../types'
import frag from '../shaders/wheat.frag.glsl?raw'
import vert from '../shaders/wheat.vert.glsl?raw'

/**
 * 一片麦穗 = 一个 InstancedBufferGeometry + 一次 draw call。
 *
 * 两片交叉的 plane 组成一株（十字形），这样从任何角度看都有体积，
 * 而顶点数仍然只有十几个。两万多株合起来一次画完，CPU 每帧只需要更新几个 uniform。
 */
/** 麦穗宽度轮廓：细秆（0~0.55）→ 穗部鼓起（0.55~1）→ 收尖，剪影一眼就是麦子 */
function wheatWidth(t: number): number {
  if (t < 0.55) return 0.5 + 0.22 * (t / 0.55)
  const u = (t - 0.55) / 0.45
  return 0.72 + 0.62 * Math.sin(u * Math.PI * 0.92) - 0.28 * u * u
}

function createBladeGeometry(width: number, height: number, segments: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(width, height, 1, segments)
  a.translate(0, height / 2, 0) // 让根部落在 y = 0
  // 按高度把平面捏成"秆 + 麦穗"的轮廓
  const pos = a.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / height
    pos.setX(i, pos.getX(i) * wheatWidth(t))
  }
  a.computeVertexNormals()
  const b = a.clone()
  b.rotateY(Math.PI / 2)
  const merged = mergeGeometries([a, b])
  a.dispose()
  b.dispose()
  if (!merged) throw new Error('[wisp-field] 麦穗几何体合并失败')
  return merged
}

export class WheatField {
  readonly mesh: THREE.Mesh
  private readonly geometry: THREE.InstancedBufferGeometry
  private readonly material: THREE.ShaderMaterial

  private readonly baseCold = new THREE.Color(CONFIG.wheat.colors.baseCold)
  private readonly tipCold = new THREE.Color(CONFIG.wheat.colors.tipCold)
  private readonly baseWarm = new THREE.Color(CONFIG.wheat.colors.baseWarm)
  private readonly tipWarm = new THREE.Color(CONFIG.wheat.colors.tipWarm)

  constructor(count = CONFIG.wheat.count) {
    const w = CONFIG.wheat
    const blade = createBladeGeometry(w.bladeWidth, w.bladeHeight, w.segments)

    // 分区铺草：1/4 铺"家"的圆形草坪（半径 homeRadius，边缘径向羽化），
    // 3/4 撒进北延的大麦田（北区面积是家的 3.7 倍，份数要跟上才不会稀）
    const homeCount = Math.round(count * 0.25)
    const northCount = count - homeCount
    const total = homeCount + northCount

    const offsets = new Float32Array(total * 3)
    const phases = new Float32Array(total)
    const tints = new Float32Array(total)
    const scales = new Float32Array(total)
    const rotations = new Float32Array(total)
    const zones = new Float32Array(total)

    const S = 0.7071
    let idx = 0
    // 家：均匀圆盘采样（sqrt 让密度均匀），中心高、边缘矮的自然层次
    for (let i = 0; i < homeCount; i++, idx++) {
      const rr = Math.sqrt(Math.random()) * w.homeRadius
      const aa = Math.random() * Math.PI * 2
      const jj = 0.9 + Math.random() * 0.2
      const x = Math.cos(aa) * rr * jj
      const z = Math.sin(aa) * rr * jj
      const rn = rr / w.homeRadius
      offsets[idx * 3 + 0] = x
      offsets[idx * 3 + 1] = 0
      offsets[idx * 3 + 2] = z
      phases[idx] = Math.random() * Math.PI * 2
      tints[idx] = Math.random()
      scales[idx] = (0.82 + Math.random() * 0.4) * (0.8 + 0.2 * (1 - rn * rn))
      rotations[idx] = Math.random() * Math.PI
    }
    // 北延区：成簇撒（簇心 + 每簇 15 株），簇间留出空地——
    // 真麦田的斑驳感来自成簇，均匀撒会读成"稀稀拉拉的棍子"
    const perCluster = 15
    const clusters = Math.ceil(northCount / perCluster)
    for (let c = 0; c < clusters; c++) {
      // 簇心：北进深度 16~水线前 6 单位（不伸进海里），横向 ±21
      let cd = 0
      let cw = 0
      for (let attempt = 0; attempt < 8; attempt++) {
        cd = 16 + Math.random() * (CONFIG.sea.start - 6 - 16)
        cw = (Math.random() - 0.5) * 42
        const x = (cw - cd) * S
        const z = -(cd + cw) * S
        if (Math.hypot(x, z) > w.homeRadius + 1) break
      }
      const n = Math.min(perCluster, northCount - (c * perCluster))
      for (let i = 0; i < n && idx < total; i++, idx++) {
        const d = cd + (Math.random() - 0.5) * 6.5
        const wp = cw + (Math.random() - 0.5) * 6.5
        offsets[idx * 3 + 0] = (wp - d) * S
        offsets[idx * 3 + 1] = 0
        offsets[idx * 3 + 2] = -(d + wp) * S
        phases[idx] = Math.random() * Math.PI * 2
        tints[idx] = Math.random()
        scales[idx] = 0.82 + Math.random() * 0.4
        rotations[idx] = Math.random() * Math.PI
        zones[idx] = 1
      }
    }
    const instanced = total

    const geo = new THREE.InstancedBufferGeometry()
    geo.index = blade.index
    geo.setAttribute('position', blade.getAttribute('position'))
    geo.setAttribute('normal', blade.getAttribute('normal'))
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3))
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 1))
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1))
    geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(rotations, 1))
    geo.setAttribute('aZone', new THREE.InstancedBufferAttribute(zones, 1))
    geo.instanceCount = instanced
    // 顶点在 shader 里被位移，包围盒已不可信，交给手动设定并关掉视锥剔除
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), w.fieldSize)
    this.geometry = geo

    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uHand: { value: new THREE.Vector3() },
        uHandRadius: { value: w.handRadius },
        uHandStrength: { value: 0 },
        uGirl: { value: new THREE.Vector3() },
        uGirlStrength: { value: 0 },
        uWindDir: { value: new THREE.Vector2(Math.cos(w.windDirection), Math.sin(w.windDirection)) },
        uWindStrength: { value: w.windStrength },
        uGustScale: { value: w.gustScale },
        uGustSpeed: { value: w.gustSpeed },
        uGustStrength: { value: w.gustStrength },
        uBladeHeight: { value: w.bladeHeight },
        uSwayScale: { value: w.swayScale },
        uFieldHalf: { value: w.fieldSize * 0.5 },
        uHomeRadius: { value: w.homeRadius },
        uNorthOpen: { value: 0 },
        uSeaStart: { value: CONFIG.sea.start },
        uSeaEnd: { value: CONFIG.sea.end },
        uFlower: {
          value: [
            new THREE.Vector3(-999, -999, 0),
            new THREE.Vector3(-999, -999, 0),
            new THREE.Vector3(-999, -999, 0),
            new THREE.Vector3(-999, -999, 0),
          ],
        },
        uFlowerRadius: { value: 1.3 },
        uColorBase: { value: this.baseCold.clone() },
        uColorTip: { value: this.tipCold.clone() },
        uColorGlow: { value: new THREE.Color(w.colors.glow) },
        uFogColor: { value: new THREE.Color(CONFIG.fog.color) },
        uFogNear: { value: CONFIG.fog.near },
        uFogFar: { value: CONFIG.fog.far },
        uLightDir: { value: new THREE.Vector3(0.4, 0.85, 0.35).normalize() },
      },
    })

    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
  }

  /**
   * @param gain 导演给的整体交互增益：第一幕接近 0（手还唤不动世界），第三幕拉满
   * @param windScale 导演给的风力倍率，基准值取自 CONFIG
   *
   * 每帧都从 CONFIG 重新取值而不是只在构造时读一次，
   * 这样调试面板改了参数立刻就能看到效果，不用刷新页面。
   */
  update(
    dt: number,
    pointer: PointerState,
    gain: number,
    windScale: number,
    girlPos: THREE.Vector3,
    girlSpeed: number,
  ): void {
    const u = this.material.uniforms
    const w = CONFIG.wheat
    u.uTime.value += dt
    u.uHand.value.copy(pointer.world)
    ;(u.uGirl.value as THREE.Vector3).copy(girlPos)
    // 她站着时留一小圈空地，走动时拨开的范围更大
    u.uGirlStrength.value = 0.5 + Math.min(1, girlSpeed / 3) * 0.6
    u.uWindStrength.value = w.windStrength * windScale
    u.uGustScale.value = w.gustScale
    u.uGustSpeed.value = w.gustSpeed
    u.uGustStrength.value = w.gustStrength
    u.uSwayScale.value = w.swayScale
    u.uHandRadius.value = w.handRadius
    ;(u.uWindDir.value as THREE.Vector2).set(Math.cos(w.windDirection), Math.sin(w.windDirection))

    const target = pointer.active ? gain * (0.8 + pointer.energy * 0.6 + pointer.grab * 0.6) : 0
    const cur = u.uHandStrength.value as number
    // 出现时快速响应（8），丢失时缓慢回落（2.2）——慢慢恢复比突然弹回好看得多
    const rate = target > cur ? 8 : 2.2
    u.uHandStrength.value = cur + (target - cur) * Math.min(1, dt * rate)
  }

  /** 0 = 沉睡的冷灰，1 = 苏醒的暖金。三幕之间靠它做整体色调过渡 */
  setWarmth(t: number): void {
    const u = this.material.uniforms
    ;(u.uColorBase.value as THREE.Color).copy(this.baseCold).lerp(this.baseWarm, t)
    ;(u.uColorTip.value as THREE.Color).copy(this.tipCold).lerp(this.tipWarm, t)
  }

  /** 设定麦浪小路的折点（世界坐标，3 段折线 4 个点），沿线的麦子伏倒成路 */
  setPath(points: THREE.Vector3[]): void {
    const arr = this.material.uniforms.uPath.value as THREE.Vector2[]
    for (let i = 0; i < 4; i++) {
      const p = points[Math.min(i, points.length - 1)]
      arr[i].set(p.x, p.z)
    }
  }

  setPathReveal(r: number): void {
    this.material.uniforms.uReveal.value = r
  }

  /** 北延麦海的显形 0~1：0 = 北边还是雾，1 = 大麦田完全长成 */
  setNorthOpen(o: number): void {
    this.material.uniforms.uNorthOpen.value = o
  }

  /** 雾带同步：镜头跟随时雾带外推，麦子的着色器雾要跟上场景雾 */
  setFog(near: number, far: number): void {
    this.material.uniforms.uFogNear.value = near
    this.material.uniforms.uFogFar.value = far
  }

  /**
   * 同步花的生长状态给 shader，让花周围的麦子让开（花和茎才露得出来）。
   * 编码约定：vec3(x, z, grow) —— .x=水平x，.y=水平z，.z=生长进度 0~1。
   *  shader 用 uFlower[i].xy 当 (x,z) 水平位置、uFlower[i].z 当进度。
   */
  setFlowers(spots: THREE.Vector3[]): void {
    const arr = this.material.uniforms.uFlower.value as THREE.Vector3[]
    for (let i = 0; i < arr.length; i++) {
      const s = spots[Math.min(i, spots.length - 1)]
      // 没传 / 花已摘走(z=0) → 挪到远处 (-999,-999,0)，shader 里 z<0.01 跳过，不干扰任何麦子
      arr[i].set(s && s.z > 0 ? s.x : -999, s && s.z > 0 ? s.y : -999, s ? s.z : 0)
    }
  }

  get uniforms() {
    return this.material.uniforms
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
