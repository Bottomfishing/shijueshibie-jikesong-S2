import * as THREE from 'three'
import { CONFIG } from '../config'
import { SeaSurface } from './SeaSurface'
import haloFrag from '../shaders/halo.frag.glsl?raw'
import haloVert from '../shaders/halo.vert.glsl?raw'

/**
 * 场景环境：草地 + 发光的树。
 *
 * 纪念碑谷那套语言的关键是"几乎没有光照"—— 纯色块 + 沿深度的雾化，
 * 靠几何体的剪影和色阶拉开层次，而不是靠阴影和贴图。
 *
 * 草地：一块巨大的地面，向远方极缓地融进天空色——没有看得见的边界。
 * 发光的树：麦田深处的地标。第一章"树语"的锚点：
 * 小满沿麦浪让出的路走到树前，风声会让树光充能。
 */
const GROUND_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const GROUND_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSky;
uniform float uInner;
uniform float uOuter;
uniform float uTime;
uniform float uSeaStart;
uniform float uSeaEnd;
uniform vec3 uSand;
uniform vec3 uSea;
varying vec3 vWorld;
void main() {
  // 北进深度：与麦田 shader 同一套坐标系
  float d = -(vWorld.x + vWorld.z) * 0.7071;
  float w = (vWorld.x - vWorld.z) * 0.7071;
  // 草地 → 湿沙 → 海面的三级渐变（草地在水线前 4~10 单位让位，留出沙滩）
  vec3 col = mix(uColor, uSand, smoothstep(uSeaStart - 10.0, uSeaStart - 4.0, d));
  col = mix(col, uSea, smoothstep(uSeaStart - 0.5, uSeaStart + 3.0, d));

  // 海面的金色波纹：随时间缓慢推进的亮带
  float inSea = smoothstep(uSeaStart - 5.0, uSeaEnd - 8.0, d);
  float stripe = 0.5 + 0.5 * sin(d * 0.45 - uTime * 0.55);
  col *= 1.0 + stripe * inSea * 0.5;
  // 远处海平线的高光（推得更远，避免栈桥背后的海面过白读成"断桥"）
  col = mix(col, vec3(1.0, 0.93, 0.72), smoothstep(uSeaEnd + 18.0, uSeaEnd + 44.0, d) * 0.55);

  // 太阳光路：从岸边通向海平线的闪烁金色光带
  float glitterBand = smoothstep(4.0, 0.0, abs(w));
  float glit = glitterBand * inSea * (0.45 + 0.55 * sin(d * 0.7 - uTime * 1.4) * sin(d * 0.13 + uTime * 0.4));
  col = mix(col, vec3(1.0, 0.95, 0.75), glit * 0.6);

  // 潮水涨落：水线随时间轻轻推拉，泡沫线跟着走
  float tide = uSeaStart + sin(uTime * 0.4) * 1.6 + sin(uTime * 0.13) * 0.8;
  float foamMain = 1.0 - smoothstep(0.0, 1.5, abs(d - tide));
  float foam2 = 1.0 - smoothstep(0.0, 0.9, abs(d - tide - 2.4 - sin(uTime * 0.3) * 1.1));
  vec3 foamCol = vec3(1.0, 0.97, 0.88);
  float foamOn = step(uSeaStart - 4.0, d);
  col = mix(col, foamCol, (foamMain * 0.8 + foam2 * 0.4) * foamOn);
  // 湿沙反光：水线靠陆地一侧一段更亮，像刚被浪打湿
  float wet = smoothstep(uSeaStart - 6.0, uSeaStart - 1.0, d) * (1.0 - smoothstep(uSeaStart - 1.0, uSeaStart + 1.0, d));
  col += vec3(0.09, 0.07, 0.02) * wet * foamOn;

  // 远处极缓地融进天空色——但海面区域只轻微淡出，保持金色浓郁
  float deepSea = smoothstep(uSeaStart + 4.0, uSeaEnd + 16.0, d);
  float t = smoothstep(uInner, uOuter, length(vWorld.xz)) * (1.0 - deepSea * 0.8);
  gl_FragColor = vec4(mix(col, uSky, t), 1.0);
  #include <colorspace_fragment>
}
`

export class Environment {
  readonly group = new THREE.Group()
  /** 发光的树的位置：第一章小径的终点 */
  readonly treeSpot = new THREE.Vector3()
  /** 乌鸦栖点：画面最右主枝的梢端（世界坐标），供 Crows 精确停枝 */
  readonly crowPerch = new THREE.Vector3()

  private readonly groundMat: THREE.ShaderMaterial
  private readonly sea: SeaSurface
  private readonly canopyMat: THREE.MeshBasicMaterial
  private readonly glowMat: THREE.ShaderMaterial
  /** 纪念碑谷枯树的材质：黑棕剪影 + 几何感枝叶，都是扁平色块 */
  private readonly deadTrunkMat: THREE.MeshBasicMaterial
  /** 飘落的金色光尘粒子 */
  private motes: THREE.Points | null = null
  private moteMat: THREE.PointsMaterial | null = null

  private readonly coldGround = new THREE.Color('#879087')
  private readonly warmGround = new THREE.Color('#c7a45f')
  private readonly coldCanopy = new THREE.Color('#c2cdc2')
  private readonly warmCanopy = new THREE.Color('#f4e6b5')
  private readonly sky = new THREE.Color(CONFIG.fog.color)

  private treeFlash = 0
  private warmthT = 0
  private readonly tree: THREE.Group
  private readonly haloBase = 0.1

  constructor() {
    // 草地：非常大、渐隐非常缓——视野内看不到任何"边界"
    this.groundMat = new THREE.ShaderMaterial({
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      uniforms: {
        uColor: { value: this.coldGround.clone() },
        uSky: { value: this.sky.clone() },
        uInner: { value: 55 },
        uOuter: { value: 115 },
        uTime: { value: 0 },
        uSeaStart: { value: CONFIG.sea.start },
        uSeaEnd: { value: CONFIG.sea.end },
        uSand: { value: new THREE.Color('#e6cd96') },
        uSea: { value: new THREE.Color('#f0cd7e') },
      },
    })
    const groundGeo = new THREE.PlaneGeometry(240, 240)
    groundGeo.rotateX(-Math.PI / 2)
    const ground = new THREE.Mesh(groundGeo, this.groundMat)
    ground.position.y = -0.01
    ground.renderOrder = 0
    this.group.add(ground)

    // 金色的海：起伏波面从水线向北铺开
    this.sea = new SeaSurface()
    this.group.add(this.sea.mesh)

    this.canopyMat = new THREE.MeshBasicMaterial({ color: this.coldCanopy.clone(), fog: true })
    // 纪念碑谷枯树：黑棕色几何剪影，色块扁平分明
    this.deadTrunkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3a2b23'), fog: true })
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: haloVert,
      fragmentShader: haloFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color('#ffedbe') },
        uOpacity: { value: this.haloBase },
        uPower: { value: 2.2 },
      },
    })

    this.tree = new THREE.Group()
    this.buildTree()
    this.group.add(this.tree)
    this.buildSeaProps()
    this.buildClouds()
    this.buildShoreFoam()
    this.buildSeaSparkles()
  }

  /** 沙滩小物：几枚贝壳 + 一只微光的漂流瓶（第二章的钩子） */
  private bottleGlow!: THREE.ShaderMaterial

  private buildSeaProps(): void {
    const shellMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#faf3e3'), fog: true })
    const S = 0.7071
    for (let i = 0; i < 6; i++) {
      const d = CONFIG.sea.start - 7 - Math.random() * 4
      const w = (Math.random() - 0.5) * 40
      const shell = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.1, 5), shellMat)
      shell.scale.set(1, 0.45, 1.25)
      shell.position.set((w - d) * S + (Math.random() - 0.5) * 2, 0.03, -(d + w) * S + (Math.random() - 0.5) * 2)
      shell.rotation.y = Math.random() * Math.PI
      this.group.add(shell)
    }

    // 漂流瓶：躺在沙滩上，瓶口一圈微光呼吸——走近看个究竟（第二章入口）
    const bd = CONFIG.sea.start - 3
    const bw = 7
    const bottle = new THREE.Group()
    const glassMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#dff0e2'),
      transparent: true,
      opacity: 0.85,
      fog: true,
    })
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.4, 8), glassMat)
    body.rotation.z = Math.PI / 2 - 0.15
    bottle.add(body)
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.16, 8), glassMat)
    neck.position.set(0.24, 0.05, 0)
    neck.rotation.z = Math.PI / 2 - 0.15
    bottle.add(neck)
    this.bottleGlow = new THREE.ShaderMaterial({
      vertexShader: haloVert,
      fragmentShader: haloFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color('#bfff9e') },
        uOpacity: { value: 0.3 },
        uPower: { value: 2.4 },
      },
    })
    const bottleGlowMesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), this.bottleGlow)
    bottleGlowMesh.renderOrder = 2
    bottle.add(bottleGlowMesh)
    const bwx = (bw - bd) * S
    const bwz = -(bd + bw) * S
    bottle.position.set(bwx + (Math.random() - 0.5) * 2, 0.09, bwz + (Math.random() - 0.5) * 2)
    bottle.rotation.y = Math.random() * Math.PI
    this.group.add(bottle)
  }

  /** 平涂云：几团缓慢漂过海面上空的扁圆云 */
  private clouds: THREE.Group[] = []

  private buildClouds(): void {
    const cloudMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fdf8ea'), fog: true })
    for (let i = 0; i < 3; i++) {
      const cloud = new THREE.Group()
      const puffs = 2 + Math.floor(Math.random() * 2)
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(1.6 + Math.random() * 1.4, 10, 8), cloudMat)
        puff.scale.set(1.5, 0.55, 1)
        puff.position.set(p * 1.7 - puffs * 0.8, Math.random() * 0.4, 0)
        cloud.add(puff)
      }
      const d = CONFIG.sea.end + 14 + i * 9
      const w = (Math.random() - 0.5) * 70
      cloud.position.set((w - d) * 0.7071, 15 + i * 2.5, -(d + w) * 0.7071)
      cloud.userData.drift = 0.25 + Math.random() * 0.25
      this.clouds.push(cloud)
      this.group.add(cloud)
    }
  }

  /** 浪花扑岸：白色泡沫粒子贴着潮线，随潮水推拉扑向沙滩 */
  private foamPts: THREE.Points | null = null
  private foamMat: THREE.PointsMaterial | null = null
  private foamOff: Float32Array | null = null

  private buildShoreFoam(): void {
    const n = 80
    this.foamOff = new Float32Array(n * 2)
    const pos = new Float32Array(n * 3)
    const S = 0.7071
    for (let i = 0; i < n; i++) {
      this.foamOff[i * 2] = 0.3 + Math.random() * 2.8
      this.foamOff[i * 2 + 1] = (Math.random() - 0.5) * 60
      const d = CONFIG.sea.start + this.foamOff[i * 2]
      const w = this.foamOff[i * 2 + 1]
      pos[i * 3 + 0] = (w - d) * S
      pos[i * 3 + 1] = 0.08
      pos[i * 3 + 2] = -(d + w) * S
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.foamMat = new THREE.PointsMaterial({
      color: new THREE.Color('#fffdf4'),
      size: 0.16,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    })
    this.foamPts = new THREE.Points(geo, this.foamMat)
    this.foamPts.renderOrder = 2
    this.group.add(this.foamPts)
  }

  private sparkles: THREE.Points | null = null
  private sparkleMat: THREE.PointsMaterial | null = null

  private buildSeaSparkles(): void {
    const n = 90
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const d = CONFIG.sea.start + Math.random() * 26
      const w = (Math.random() - 0.5) * 56
      pos[i * 3 + 0] = (w - d) * 0.7071
      pos[i * 3 + 1] = 0.42
      pos[i * 3 + 2] = -(d + w) * 0.7071
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.sparkleMat = new THREE.PointsMaterial({
      color: new THREE.Color('#fff3c4'),
      size: 0.22,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    })
    this.sparkles = new THREE.Points(geo, this.sparkleMat)
    this.sparkles.renderOrder = 1
    this.group.add(this.sparkles)
  }

  /** 纪念碑谷枯树：黑棕几何剪影，主枝干 + 放射枯枝 + 几何叶簇，在暖金麦田里作深色地标。
   *  放在场景斜左上方（西北方向，相机视线远端）。 */
  private buildTree(): void {
    // 场景斜左上方；再往画面"左侧"挪一点 → 世界坐标沿横向 -w（西南）方向拉开。
    // 相机从东南(21,30,21)看向西北(-2.2,0,-2.2)，画面左侧 ≈ 世界 -w 方向（向西南）。
    const dir = new THREE.Vector3(-0.7071, 0, -0.7071) // 斜左上方基准方向
    // 向下移：沿视线方向把树拉近（16→13），树在画面里更靠下/居中，乌鸦停枝上更醒目
    const pos = dir.clone().multiplyScalar(13)
    // 向左移：横向 w 方向（垂直于视线）再偏 -6，即向西南/画面左挪
    const left = new THREE.Vector3(-0.7071, 0, 0.7071) // 世界 -w（画面左）单位方向
    pos.addScaledVector(left, 6)
    this.treeSpot.copy(pos)
    this.tree.position.set(pos.x, 0, pos.z)

    // ── 枢纽枝干：底部对齐分叉点，向上长 len，绕分叉点旋转 rx/rz 后自然向外"长"出 ──
    // 关键：CylinderGeometry 用 translate 把底面移到原点，再对 mesh 设 rotation，
    // 枝条就从分叉点真实拔出，不再出现"中心点摆放导致的浮空横插"。
    const branch = (
      origin: THREE.Vector3,
      len: number,
      r0: number,
      r1: number,
      rx = 0,
      rz = 0,
      seg = 6,
    ): THREE.Vector3 => {
      const geo = new THREE.CylinderGeometry(r1, r0, len, seg)
      geo.translate(0, len / 2, 0)
      const m = new THREE.Mesh(geo, this.deadTrunkMat)
      m.position.copy(origin)
      m.rotation.x = rx
      m.rotation.z = rz
      this.tree.add(m)
      // 精确枝梢坐标（用 mesh 自身的旋转算），子枝从这里接出，保证衔接不留缝
      return new THREE.Vector3(0, len, 0).applyEuler(m.rotation).add(origin)
    }

    // ── 主干：两段，下粗上收，反向微斜构成 S 形剪影（不是一根粗柱子）──
    // base：根部较圆润、向上徐收；bole：接在 base 顶端、朝另一侧微斜，形成自然收势
    branch(new THREE.Vector3(0, 0, 0), 4.0, 0.66, 0.44, 0, 0.03)
    branch(new THREE.Vector3(0.10, 3.95, 0), 4.6, 0.44, 0.27, 0, -0.04)

    // 后续分叉统一沿主干轴线（近似取 x=0.10 的竖直轴），避免误差累积
    const ax = 0.10
    const yFor = (h: number) => new THREE.Vector3(ax, h, 0)

    // ── 主枝：从主干不同高度向外上方拔出，每根都粗壮，像正常老树开枝 ──
    const A = branch(yFor(6.0), 3.8, 0.40, 0.24, 0, -0.60)  // 左上
    const B = branch(yFor(7.0), 3.6, 0.36, 0.22, 0.15, 0.55) // 右上(略后)
    const C = branch(yFor(7.9), 3.2, 0.32, 0.20, 0.55, 0.05) // 后
    const D = branch(yFor(8.6), 3.8, 0.28, 0.18, 0.10, 0.10) // 顶端主梢(向上)
    // ── 子枝：主枝/主梢末端再分小枝，密一档，树冠更立体 ──
    branch(A, 2.4, 0.16, 0.09, 0, -0.55, 5)
    branch(A, 2.0, 0.15, 0.08, 0.35, -0.35, 5)
    branch(B, 2.2, 0.15, 0.08, 0.15, 0.65, 5)
    branch(B, 1.9, 0.14, 0.08, -0.25, 0.40, 5)
    branch(C, 2.1, 0.14, 0.08, 0.75, 0.05, 5)
    branch(D, 2.2, 0.14, 0.08, 0.12, -0.45, 5)
    branch(D, 1.9, 0.13, 0.08, -0.18, 0.45, 5)

    // ── 乌鸦栖点：A 主梢的一根干净子枝（A子枝1）的最末端尖端。──
    // 用户要"站树杈的尖端、不被遮挡"。A 主枝中段会被 A 子枝2 横穿（用户截图），
    // 而 A 子枝1 末端不再分叉，是 100% 干净的"树杈尖端"：NDC(-0.13,0.88) 在画面内，
    // 且顶端无任何枝干横穿，乌鸦站上去就是完整剪影。
    // A 子枝1：branch(A, 2.4, 0.16, 0.09, 0, -0.55, 5)，从 A 梢端分出，朝画面左上方伸展。
    const aSub1 = new THREE.Vector3(0, 2.4, 0)
      .applyEuler(new THREE.Euler(0, 0, -0.55))
      .add(A) // A 子枝1 梢端（树局部坐标）
    this.crowPerch.copy(aSub1).add(this.tree.position)

    // ── 树下地面一圈浅浅暖光，落在草地上 ──
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), this.glowMat)
    pool.rotation.x = -Math.PI / 2
    pool.position.y = 0.02
    pool.renderOrder = 0
    this.tree.add(pool)

    // ── 效果 3：飘落的金色光尘粒子，萦绕在枯树周围，呼应当前场景的光点氛围 ──
    this.buildTreeMotes(pos)
  }

  /** 枯树周围飘落的金色光尘：缓慢上升的暖色粒子，围着树冠打转（树变大，光尘范围/高度跟着放大） */
  private buildTreeMotes(center: THREE.Vector3): void {
    const n = 34
    const pos = new Float32Array(n * 3)
    const anchor: number[] = []
    for (let i = 0; i < n; i++) {
      // 以树冠为球心，散落在半径 2.0~5.0 的球壳内（树长大了，范围加大）
      const rad = 2.0 + Math.random() * 3.0
      const a = Math.random() * Math.PI * 2
      const b = Math.acos(2 * Math.random() - 1)
      const px = center.x + Math.sin(b) * Math.cos(a) * rad + (Math.random() - 0.5) * 0.8
      const py = 7.5 + Math.random() * 3.6
      const pz = center.z + Math.sin(b) * Math.sin(a) * rad + (Math.random() - 0.5) * 0.8
      pos[i * 3] = px
      pos[i * 3 + 1] = py
      pos[i * 3 + 2] = pz
      anchor.push(i)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.moteMat = new THREE.PointsMaterial({
      color: new THREE.Color('#ffd97d'),
      size: 0.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    })
    this.motes = new THREE.Points(geo, this.moteMat)
    this.motes.renderOrder = 3
    this.tree.add(this.motes)
  }

  /** 小满抵达树前时调用：树光猛地亮一下 */
  flashTree(): void {
    this.treeFlash = 1
  }

  /** 每帧节拍：树摇摆、闪光衰减、辉光呼吸、海面推进、碎金明灭、云漂、浪花扑岸、瓶光呼吸 */
  update(dt: number, time: number): void {
    this.sea.update(time)
    this.groundMat.uniforms.uTime.value = time
    if (this.sparkleMat) {
      // 天色转暖后碎金才显现，呼吸式明灭
      this.sparkleMat.opacity = this.warmthT * (0.32 + Math.sin(time * 1.35) * 0.22)
    }
    if (this.treeFlash > 0) {
      this.treeFlash = Math.max(0, this.treeFlash - dt * 0.55)
    }
    // 枯树不再摇摆：高瘦枯枝一旦摆动，"转起来"的观感很重，且枝头会偏离乌鸦栖点。
    // 停稳的枯树才像纪念碑谷的静态地标。只保留光尘与辉光呼吸的"活"，树本身不动。

    // 光尘粒子：围绕枯树缓缓上升盘旋，像被风带起的金色碎屑
    if (this.motes && this.moteMat) {
      const attr = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute
      const arr = attr.array as Float32Array
      const cx = this.treeSpot.x
      const cz = this.treeSpot.z
      for (let i = 0; i < arr.length / 3; i++) {
        // 缓慢螺旋上升：绕树心转 + 抬升 + 绕回（树变大了，范围/高度跟着放大）
        const a = time * 0.4 + i * 0.9
        const r = 3.0 + Math.sin(time * 0.3 + i) * 1.0
        let y = arr[i * 3 + 1] + dt * 0.4
        if (y > 14.5) y = 7.5
        arr[i * 3] = cx + Math.cos(a) * r + (Math.random() - 0.5) * 0.06
        arr[i * 3 + 1] = y
        arr[i * 3 + 2] = cz + Math.sin(a) * r + (Math.random() - 0.5) * 0.06
      }
      attr.needsUpdate = true
      // 光尘明灭呼吸
      this.moteMat.opacity = 0.35 + Math.sin(time * 1.2) * 0.2
    }

    // 树上光圈已删；glowMat 仅服务地面暖光 pool，保持温和稳定，不随充能/闪烁乱跳
    this.glowMat.uniforms.uOpacity.value = 0.18
    this.canopyMat.color.copy(this.coldCanopy).lerp(this.warmCanopy, this.warmthT)

    // 云缓慢横漂，漂远了绕回来
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.drift * dt
      if (cloud.position.x > 60) cloud.position.x = -60
    }

    // 浪花扑岸：泡沫粒子贴着潮线，随潮水推拉
    if (this.foamPts && this.foamOff && this.foamMat) {
      const tide = CONFIG.sea.start + Math.sin(time * 0.4) * 1.6 + Math.sin(time * 0.13) * 0.8
      const S = 0.7071
      const pos = this.foamPts.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < this.foamOff.length / 2; i++) {
        const d = tide + this.foamOff[i * 2] - Math.max(0, Math.sin(time * 0.4)) * 0.6
        const w = this.foamOff[i * 2 + 1]
        pos.setXYZ(i, (w - d) * S, 0.08 + Math.abs(Math.sin(time * 1.8 + i)) * 0.1, -(d + w) * S)
      }
      pos.needsUpdate = true
      this.foamMat.opacity = 0.5 + Math.sin(time * 0.4) * 0.25
    }

    // 漂流瓶的瓶口微光呼吸
    if (this.bottleGlow) {
      this.bottleGlow.uniforms.uOpacity.value = 0.22 + Math.sin(time * 1.8) * 0.14
    }
  }

  /** 0 = 沉睡的冷灰世界，1 = 苏醒的暖金世界 */
  setWarmth(t: number): void {
    this.warmthT = t
    ;(this.groundMat.uniforms.uColor.value as THREE.Color).copy(this.coldGround).lerp(this.warmGround, t)
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })
    if (this.motes) this.motes.geometry.dispose()
    if (this.moteMat) this.moteMat.dispose()
    this.groundMat.dispose()
    this.canopyMat.dispose()
    this.glowMat.dispose()
    this.deadTrunkMat.dispose()
  }
}
