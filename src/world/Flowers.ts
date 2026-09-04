import * as THREE from 'three'
import { CONFIG } from '../config'
import haloFrag from '../shaders/halo.frag.glsl?raw'
import haloVert from '../shaders/halo.vert.glsl?raw'

interface Flower {
  group: THREE.Group
  /** 茎秆组：主茎 + 叶片，整体破土生长（scale.y）和随风摆动（rotation） */
  stemGroup: THREE.Group
  /** 主茎网格（用于叶片展开的基准高度） */
  stem: THREE.Mesh
  head: THREE.Group
  glowMat: THREE.ShaderMaterial
  home: THREE.Vector3
  pos: THREE.Vector3
  phase: number
  /** buried=埋在土里(未长) · growing=生长中 · idle=盛开(可摘) · flying=被摘飞向小满 · gone=已消失 */
  state: 'buried' | 'growing' | 'idle' | 'flying' | 'gone'
  t: number
  from: THREE.Vector3
  /** 生长进度 0..1，供 head 绽放用 */
  g: number
  /** 让位强度 0..1（麦子让开/收回的进度）。摘花后从 1 平滑衰减到 0，麦子慢慢长回来 */
  clearT: number
}

const GROW_DUR = CONFIG.flowers.growDuration
/** 摘花后花头飞向小满怀里的时长（秒） */
const FLY_DURATION = 0.6

/** 缓动：smoothstep（柔和的加速-减速，适合植物生长） */
function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * 手唤醒的花。第二幕的收集目标。
 *
 * 核心变化：花不再"一直在那等你"，而是**被你的手唤醒才破土而出**——
 * 刚开始麦甸是纯粹的荒芜，什么都没有；当玩家的手（world 坐标）掠过某个
 * 隐藏的花床点时，那里会钻出一朵花：茎从土里升起、花头绽放、光晕点亮、
 * 一圈萤火光点绕着花头旋转上升。"世界因你而活"的瞬间，零文字。
 *
 * 采集逻辑不变：还是带小满走到花旁捏合摘花（花不认手指，只认她）。
 */
export class Flowers {
  readonly group = new THREE.Group()

  private readonly flowers: Flower[] = []
  /** 弯曲主茎：S 形，比笔直更"活"。TubeGeometry 沿一条 2D 曲线生成 */
  private readonly stemCurveGeo: THREE.TubeGeometry
  /** 叶片：压扁的锥体，指向外下方 */
  private readonly leafGeo = new THREE.ConeGeometry(0.06, 0.28, 5)
  private readonly petalGeo = new THREE.SphereGeometry(0.1, 10, 8)
  private readonly coreGeo = new THREE.SphereGeometry(0.09, 10, 8)
  private readonly glowGeo = new THREE.SphereGeometry(0.32, 12, 10)
  private readonly stemMat: THREE.MeshBasicMaterial
  private readonly leafMat: THREE.MeshBasicMaterial
  private readonly petalMat: THREE.MeshBasicMaterial
  private readonly coreMat: THREE.MeshBasicMaterial
  private readonly scratch = new THREE.Vector3()

  private readonly petalCold = new THREE.Color('#dfe4dd')
  private readonly petalWarm = new THREE.Color('#f7eed8')
  private readonly coreCold = new THREE.Color('#cfd8c8')
  private readonly coreWarm = new THREE.Color('#ffd97d')

  collected = 0
  /** 剩余未收集数量。每帧被导演读取，不用 filter 现算 */
  private idleCount = 0
  /** 到达花旁但没捏合 → 请求 App 弹一次摘花教学提示（带冷却，不刷屏） */
  pickupPrompt = false
  private promptCd = 0
  /** 摘花时飘散的花瓣粒子 */
  private readonly bursts: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = []
  private readonly burstGeo = new THREE.SphereGeometry(0.055, 6, 5)
  /** 花头绽放后围绕旋转上升的萤火光点 */
  private readonly fireflies: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; angle: number; r: number; h: number; spd: number; f: Flower }[] = []

  constructor(count = CONFIG.flowers.count) {
    this.stemMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#6f9a52'), fog: true })
    this.leafMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5f8548'), fog: true })
    this.petalMat = new THREE.MeshBasicMaterial({ color: this.petalCold.clone(), fog: true })
    this.coreMat = new THREE.MeshBasicMaterial({ color: this.coreCold.clone(), fog: true })

    // 弯曲主茎：沿一条 2D S 形曲线生成 Tube，比笔直圆柱更"像活的花"。
    // 加长到 ~0.72，让整株花明显高出周围让位后的麦子，一眼能看到茎。
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.02, 0.2, 0),
      new THREE.Vector3(-0.016, 0.44, 0.012),
      new THREE.Vector3(0.012, 0.62, 0),
      new THREE.Vector3(0, 0.72, 0),
    ])
    this.stemCurveGeo = new THREE.TubeGeometry(curve, 14, 0.032, 8, false)

    for (let i = 0; i < count; i++) {
      const group = new THREE.Group()

      // ── 茎秆组：主茎（S 形弯曲）+ 两片叶子，整体破土生长 ──
      const stemGroup = new THREE.Group()
      // 主茎：弯曲管，根部在 y=0，顶端 y≈0.5
      const stem = new THREE.Mesh(this.stemCurveGeo, this.stemMat)
      stemGroup.add(stem)
      // 两片叶子：压扁的锥体，从茎中下部斜向外长出
      for (const side of [-1, 1]) {
        const leaf = new THREE.Mesh(this.leafGeo, this.leafMat)
        leaf.scale.set(1, 1, 0.4) // 压扁成叶状
        leaf.position.set(side * 0.06, 0.32, 0)
        // 向外下方倾斜 + 贴地生长感
        leaf.rotation.z = side * (Math.PI / 2.4)
        leaf.rotation.x = 0.3
        stemGroup.add(leaf)
      }
      stemGroup.scale.y = 0.02 // 初始几乎埋进土里
      group.add(stemGroup)

      // ── 花头：6 片花瓣围一圈 + 发光的花芯 + 标记用的柔光泡 ──
      const head = new THREE.Group()
      head.position.y = 0.74
      head.scale.setScalar(0.02) // 初始蜷缩
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2
        const petal = new THREE.Mesh(this.petalGeo, this.petalMat)
        petal.scale.set(1, 0.32, 1.5)
        petal.position.set(Math.cos(a) * 0.14, 0.02, Math.sin(a) * 0.14)
        petal.rotation.y = -a
        head.add(petal)
      }
      const core = new THREE.Mesh(this.coreGeo, this.coreMat)
      core.position.y = 0.045
      head.add(core)

      const glowMat = new THREE.ShaderMaterial({
        vertexShader: haloVert,
        fragmentShader: haloFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: new THREE.Color('#ffcf6a') },
          uOpacity: { value: 0.0 }, // 初始熄灭，生长时点亮
          uPower: { value: 2.2 },
        },
      })
      const glow = new THREE.Mesh(this.glowGeo, glowMat)
      glow.renderOrder = 3
      glow.scale.setScalar(0.02)
      head.add(glow)

      group.add(head)

      this.flowers.push({
        group,
        stemGroup,
        stem,
        head,
        glowMat,
        home: new THREE.Vector3(),
        pos: new THREE.Vector3(),
        phase: Math.random() * Math.PI * 2,
        state: 'buried',
        t: 0,
        from: new THREE.Vector3(),
        g: 0,
        clearT: 0,
      })
      this.group.add(group)
    }

    this.reset()
  }

  /**
   * 相机视线的水平方向（21,30,21 → -2.2,0,-2.2）。
   * 花落点要避开"石碑身后这条视线带"，否则会被碑挡住。
   */
  private static readonly VIEW_DIR = new THREE.Vector2(-0.7071, -0.7071)

  /**
   * 重新种花：均匀角度+抖动撒在外围，并做视线遮挡检测——
   * 花若落在任何一座石碑正后方（沿相机视线 1.8 单位宽的带内）就重新落点。
   * 初始全部 buried（埋土），等玩家手靠近才生长。
   * @param stoneSpots 石碑落点列表（来自 Environment），不传则跳过检测
   */
  reset(stoneSpots?: THREE.Vector3[]): void {
    this.collected = 0
    this.idleCount = this.flowers.length
    const cfg = CONFIG.flowers
    const view = Flowers.VIEW_DIR
    const rel = new THREE.Vector2()

    for (let i = 0; i < this.flowers.length; i++) {
      const f = this.flowers[i]
      // 最多尝试 30 次落点：避开石碑遮挡带，且落在屏幕舒适区内（上下沿也够得到）
      for (let attempt = 0; attempt < 30; attempt++) {
        const angle = (i / this.flowers.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.9
        const radius = cfg.radiusMin + Math.random() * (cfg.radiusMax - cfg.radiusMin)
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        // 屏幕上下沿的世界区域太远，挤回舒适区
        f.home.set(
          Math.max(-cfg.reachLimit, Math.min(cfg.reachLimit, x)),
          0,
          Math.max(-cfg.reachLimit, Math.min(cfg.reachLimit, z)),
        )

        if (!stoneSpots || stoneSpots.length === 0) break
        const blocked = stoneSpots.some((s) => {
          rel.set(f.home.x - s.x, f.home.z - s.z)
          const along = rel.dot(view)
          const across = Math.abs(rel.x * view.y - rel.y * view.x)
          return along > 0 && across < 1.8
        })
        if (!blocked) break
      }

      f.pos.copy(f.home)
      f.state = 'buried'
      f.t = 0
      f.g = 0
      f.clearT = 0
      f.phase = Math.random() * Math.PI * 2
      f.group.visible = false
      f.group.scale.setScalar(1)
      f.stemGroup.visible = true
      f.stemGroup.scale.y = 0.02
      f.stemGroup.rotation.x = 0
      f.head.scale.setScalar(0.02)
      f.glowMat.uniforms.uOpacity.value = 0
    }
    // 清掉所有萤火
    this.clearFireflies()
  }

  /**
   * 当前状态机的"可摘"判定：idle 才算目标（不含 buried/growing/flying/gone）
   */
  setVisible(v: boolean): void {
    for (const f of this.flowers) {
      if (f.state !== 'gone') f.group.visible = v
    }
  }

  /** 0 = 冷，1 = 暖 */
  setWarmth(t: number): void {
    this.petalMat.color.copy(this.petalCold).lerp(this.petalWarm, t)
    this.coreMat.color.copy(this.coreCold).lerp(this.coreWarm, t)
  }

  get remaining(): number {
    return this.idleCount
  }

  /**
   * 供麦浪 shader 同步"花让位"：返回每朵花的水平位置和生长进度。
   * 编码约定：vec3(x, z, clearT) —— .x=水平x，.y=水平z，.z=让位强度 0~1。
   *  shader 用 uFlower[i].xy 当 (x,z) 水平位置、uFlower[i].z 当让位强度。
   *  强度 0=麦子正常，1=花周围麦子让开。摘花后 clearT 由 update 平滑衰减到 0，麦子慢慢长回来。
   */
  getSpots(): THREE.Vector3[] {
    // 用 f.home（扎根的位置）而不是 f.pos：摘花后 f.pos 会飞向小满怀里，
    // 若用 pos 会让"麦子让出的空位"跟着花头满场跑。空位必须钉在根部原地。
    return this.flowers.map((f) => new THREE.Vector3(f.home.x, f.home.z, f.clearT))
  }

  /**
   * @param girlPos   小满的地面位置——摘花判定用水平距离（花的根在地面）
   * @param girlAnchor 小满的胸口位置——花头飞向的目标
   * @param grab      捏合手势（鼠标=按住左键）。走到花旁还要捏合才摘得下——摘花是明确动作
   * @param handPos   玩家的手的世界坐标——**唤醒花的来源**。手靠近花床才触发破土生长
   * @returns 本帧新收集的数量，导演用它判断何时推进到第三幕
   */
  update(dt: number, time: number, girlPos: THREE.Vector3, girlAnchor: THREE.Vector3, grab: number, handPos: THREE.Vector3): number {
    const cfg = CONFIG.flowers
    let gained = 0
    this.promptCd -= dt

    for (const f of this.flowers) {
      if (f.state === 'gone') continue

      if (f.state === 'buried') {
        // 手靠近（world 坐标）→ 触发生长。growRadius 内用手或小满都行，先用手（更主动）
        const dHand = handPos ? Math.hypot(f.pos.x - handPos.x, f.pos.z - handPos.z) : 999
        const dGirl = Math.hypot(f.pos.x - girlPos.x, f.pos.z - girlPos.z)
        if (dHand < cfg.growRadius || dGirl < cfg.growRadius * 0.7) {
          f.state = 'growing'
          f.t = 0
          f.g = 0
          f.group.visible = true
        }
      } else if (f.state === 'growing') {
        f.t += dt / GROW_DUR
        if (f.t >= 1) {
          f.state = 'idle'
          f.t = 1
          f.g = 1
        }
      } else if (f.state === 'idle') {
        // 随风轻摆 + 醒着时的呼吸发光
        f.head.rotation.z = Math.sin(time * 0.9 + f.phase) * 0.07
        f.head.rotation.x = Math.cos(time * 0.7 + f.phase * 1.3) * 0.05
        f.glowMat.uniforms.uOpacity.value =
          0.55 + Math.sin(time * (1.9 + 2.5)) * 0.12

        const d = Math.hypot(f.pos.x - girlPos.x, f.pos.z - girlPos.z)
        if (d < cfg.collectDist && grab > 0.5) {
          // 捏合 + 站在花上 = 摘到：花头离茎飞进她怀里，花瓣飘散
          f.state = 'flying'
          f.t = 0
          f.from.copy(f.pos)
          f.stemGroup.visible = false
          this.spawnBurst(f.pos)
          this.clearFirefliesOf(f)
          gained++
          this.collected++
          this.idleCount--
        } else {
          // 她靠近时花会苏醒：花芯变亮、整株朝她探头
          const near = 1 - Math.min(1, d / cfg.attractRadius)
          f.glowMat.uniforms.uOpacity.value += near * 0.4
          if (d < cfg.attractRadius) {
            this.scratch.subVectors(girlPos, f.pos).setY(0).normalize()
            const lean = near * 0.35
            f.head.rotation.x += this.scratch.z * lean
            f.head.rotation.z -= this.scratch.x * lean
            if (d < cfg.collectDist && grab <= 0.5 && this.promptCd <= 0) {
              this.pickupPrompt = true
              this.promptCd = 4
            }
          }
        }
      } else if (f.state === 'flying') {
        // 摘花后：麦子让位要缓缓收回，而不是瞬间恢复（否则"突然消失"很突兀）。
        // clearT 从当前值平滑衰减到 0（约 1.6 秒），麦子一根根长回去。
        f.clearT = Math.max(0, f.clearT - dt / 1.6)
        f.t += dt / FLY_DURATION
        if (f.t >= 1) {
          f.state = 'gone'
          f.group.visible = false
          continue
        }
        const e = f.t * f.t * (3 - 2 * f.t)
        f.pos.lerpVectors(f.from, girlAnchor, e)
        f.group.position.copy(f.pos)
        f.group.scale.setScalar(1 - e * 0.8)
        f.group.rotation.y += dt * 6
      }

      // 生长动画（buried→idle 过程）：茎钻出 + 弯腰挺直 + 花头绽放 + 光晕点亮
      if (f.state === 'growing' || (f.state === 'idle' && f.g < 1)) {
        const e = ease(Math.min(1, f.t))
        f.g = e
        // 麦子让位与生长同步：花越长，周围麦子让得越开（平滑渐进，不突兀）
        f.clearT = Math.max(f.clearT, e)
        f.group.position.copy(f.pos)
        f.stemGroup.scale.y = 0.02 + e * 0.98
        f.head.scale.setScalar(0.02 + e * 0.9)
        f.glowMat.uniforms.uOpacity.value = e * 0.55
        // 花头在绽放时轻微旋转打开
        f.head.rotation.y = (1 - e) * 1.4
        // 破土弯腰 → 挺直：像植物弓着背钻出地面，再缓缓站直（e 从 0→1）
        // 用 sin(e*π) 让弯腰在生长中期最深，两头回正，更自然
        f.stemGroup.rotation.x = Math.sin(e * Math.PI) * 0.4
      } else if (f.state === 'idle') {
        // 醒着：茎随风轻摆（朝一个方向的柔和小坡度，叠加轻微呼吸）
        f.stemGroup.rotation.x =
          Math.sin(time * 0.8 + f.phase) * 0.06 + Math.sin(time * 1.7 + f.phase * 1.3) * 0.03
      }

      // 只有 idle 状态才生成/刷新萤火（醒着才有生命力）
      if (f.state === 'idle') {
        this.updateFireflies(dt, time, f)
      }
    }

    this.updateBursts(dt)
    return gained
  }

  /** 花头绽放后，一圈萤火光点绕花头旋转上升（"世界因你而活"的生命感） */
  private updateFireflies(dt: number, time: number, f: Flower): void {
    const hx = f.pos.x
    const hz = f.pos.z
    const headY = 0.74
    // 慢速呼吸：飞得越高越小越淡
    if (this.fireflies.length < 6) {
      // 惰性生成：每朵花最多 6 只萤火
      const exist = this.fireflies.filter((ff) => ff.f === f)
      if (exist.length < 6) {
        this.spawnFirefly(f)
      }
    }
    for (const ff of this.fireflies) {
      if (ff.f !== f) continue
      ff.angle += ff.spd * dt
      const r = ff.r * (1 + Math.sin(time * 0.7 + ff.angle) * 0.15)
      ff.h += dt * 0.35
      const y = headY + ff.h
      if (y > headY + 0.7) {
        ff.h = 0
      }
      ff.mesh.position.set(hx + Math.cos(ff.angle) * r, y, hz + Math.sin(ff.angle) * r)
      const l = 1 - (ff.h / 0.7) * 0.5
      ff.mat.opacity = 0.75 * l
      ff.mesh.scale.setScalar(0.8 + Math.sin(time * 3 + ff.angle * 2) * 0.15)
    }
  }

  private spawnFirefly(f: Flower): void {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffe9a8'),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    })
    const mesh = new THREE.Mesh(this.burstGeo, mat)
    mesh.renderOrder = 4
    this.group.add(mesh)
    this.fireflies.push({
      mesh,
      mat,
      angle: Math.random() * Math.PI * 2,
      r: 0.24 + Math.random() * 0.22,
      h: Math.random() * 0.5,
      spd: 1 + Math.random() * 1.2,
      f,
    })
  }

  private clearFirefliesOf(f: Flower): void {
    for (let i = this.fireflies.length - 1; i >= 0; i--) {
      if (this.fireflies[i].f === f) {
        this.group.remove(this.fireflies[i].mesh)
        this.fireflies[i].mat.dispose()
        this.fireflies.splice(i, 1)
      }
    }
  }

  private clearFireflies(): void {
    for (const ff of this.fireflies) {
      this.group.remove(ff.mesh)
      ff.mat.dispose()
    }
    this.fireflies.length = 0
  }

  /** 摘花瞬间：一圈花瓣从花头位置向上飘散、旋转、淡出 */
  private spawnBurst(at: THREE.Vector3): void {
    for (let i = 0; i < 9; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffd97d'),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: true,
      })
      const mesh = new THREE.Mesh(this.burstGeo, mat)
      mesh.position.set(at.x + (Math.random() - 0.5) * 0.3, 0.55, at.z + (Math.random() - 0.5) * 0.3)
      mesh.scale.setScalar(0.7 + Math.random() * 0.6)
      const a = Math.random() * Math.PI * 2
      this.bursts.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * (0.5 + Math.random()), 1.3 + Math.random() * 0.9, Math.sin(a) * (0.5 + Math.random())),
        life: 0,
      })
      this.group.add(mesh)
    }
  }

  private updateBursts(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]
      b.life += dt / 0.9
      if (b.life >= 1) {
        this.group.remove(b.mesh)
        ;(b.mesh.material as THREE.Material).dispose()
        this.bursts.splice(i, 1)
        continue
      }
      b.vel.y -= 2.2 * dt
      b.mesh.position.addScaledVector(b.vel, dt)
      b.mesh.rotation.x += dt * 5
      b.mesh.rotation.z += dt * 4
      const s = 1 - b.life
      b.mesh.scale.setScalar(0.7 + 0.6 * s)
      ;(b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * s
    }
  }

  dispose(): void {
    this.stemCurveGeo.dispose()
    this.leafGeo.dispose()
    this.petalGeo.dispose()
    this.coreGeo.dispose()
    this.glowGeo.dispose()
    this.stemMat.dispose()
    this.leafMat.dispose()
    this.petalMat.dispose()
    this.coreMat.dispose()
    for (const f of this.flowers) f.glowMat.dispose()
    this.clearFireflies()
  }
}
