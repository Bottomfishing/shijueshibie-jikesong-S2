import * as THREE from 'three'
import { CONFIG } from '../config'
import type { PointerState } from '../types'

export type GirlState = 'dormant' | 'waking' | 'bonded'

/** 她的家：麦田正中 */
const NEST = new THREE.Vector3(0, 0, 0)

function wobble(t: number, seed: number): number {
  return (
    Math.sin(t * 1.0 + seed) * 0.5 + Math.sin(t * 2.3 + seed * 1.7) * 0.3 + Math.sin(t * 4.1 + seed * 3.1) * 0.2
  )
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * 小满——麦田的主角，戴红帽子的小姑娘。
 *
 * 可爱三件套：Q 版大头比例、会颠的双丸子头、会眨的眼 + 腮红。
 * 腿是真腿：交替摆动 + 抬脚 + 红鞋子，走路感从实际速度推导，一动全动。
 */
export class Girl {
  readonly group = new THREE.Group()
  state: GirlState = 'dormant'

  private readonly pos = new THREE.Vector3().copy(NEST)
  private readonly vel = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly accel = new THREE.Vector3()
  private readonly scratch = new THREE.Vector3()
  /** 收集物飞向的位置（胸口高度），每帧同步 */
  readonly collectAnchor = new THREE.Vector3(0, 0.8 * CONFIG.girl.scale, 0)

  /** figure = 除阴影外的全部部件，走路起伏只作用于它，影子留在地上 */
  private readonly figure = new THREE.Group()
  private readonly dress: THREE.Mesh
  private readonly dressMat: THREE.MeshBasicMaterial
  private readonly headGroup = new THREE.Group()
  private readonly bunL: THREE.Mesh
  private readonly bunR: THREE.Mesh
  private readonly eyeL: THREE.Mesh
  private readonly eyeR: THREE.Mesh
  private readonly armL: THREE.Group
  private readonly armR: THREE.Group
  private readonly legL: THREE.Group
  private readonly legR: THREE.Group
  private readonly shadowMat: THREE.MeshBasicMaterial
  /** 小披肩：致敬艾达的斗篷元素，做得轻、窄肩，随步伐微摆（小满式，不堆砌） */
  private readonly cape: THREE.Mesh
  private readonly capeMat: THREE.MeshBasicMaterial
  /** 披风 shader 用到的全局值：uTime 相位、uSway 摆幅（0~1，风/速度驱动） */
  private readonly capeUniforms: { uTime: { value: number }; uSway: { value: number } }

  private readonly dressCold = new THREE.Color('#e9e6da')
  private readonly dressWarm = new THREE.Color('#f7edd8')

  private facing = 0
  private headTilt = 0.5
  private bobPhase = 0
  /** 收集/换幕的小跳：-1 = 没在跳 */
  private hopT = -1
  /** 章节自动寻路：非空时她沿路径点自己走，不理会手指 */
  private autoWaypoints: THREE.Vector3[] | null = null
  private autoIndex = 0
  private onArrive?: () => void
  /** 风门控：风不够时她驻足等待（"没有风，路就不显现"） */
  paused = false

  // 走路滞回：进入走动 >0.25，归位静止 <0.12，中间保持上次状态，避免指针停住时"走/停"来回闪
  private wasMoving = false
  /** 披风摆幅平滑值：走动→1，静止→0.32（残留轻微风拂），驱动 uSway uniform */
  private capeSway = 0
  /** 身体上下颠簸的平滑值（走动时叠加，静止归零） */
  private bobLift = 0
  /** 小跳的抬升高度（与 bobLift 分离，避免小跳被 lerp 吃掉） */
  private hopLift = 0

  // 眨眼
  private blinkTimer = 2
  private blinkAnim = -1
  // 丸子头的 lag 抖动用
  private bunSwing = 0

  constructor() {
    const redMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#a8402f'), fog: true })
    this.dressMat = new THREE.MeshBasicMaterial({ color: this.dressCold.clone(), fog: true })
    const skinMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f5c9a0'), fog: true })
    const hairMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5a4632'), fog: true })
    const shoeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8f382a'), fog: true })
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#4a3826'), fog: true })

    // ── 腿 ×2：真腿，交替摆 + 抬脚，红鞋点睛 ──
    this.legL = this.makeLeg(-1, skinMat, shoeMat)
    this.legR = this.makeLeg(1, skinMat, shoeMat)
    this.figure.add(this.legL, this.legR)

    // ── 裙子：纪念碑谷艾达式长袍——修长 A 字形，上提 + 缩短，露出腿部让走路摆动更明显 ──
    // 高度 0.48→0.40，position.y 0.38→0.44（下缘到 0.24，露出大腿以下），走路时腿摆才看得清
    this.dress = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.28, 0.40, 18), this.dressMat)
    this.dress.position.y = 0.44
    this.figure.add(this.dress)

    // ── 手臂 ──
    this.armL = this.makeArm(-1, skinMat)
    this.armR = this.makeArm(1, skinMat)
    this.figure.add(this.armL, this.armR)

    // ── 小斗篷：致敬艾达的斗篷元素，做成垂在背后的一片，随步伐微摆 ──
    // 模型正面朝 +Z（眼睛面），所以"背面"是 -Z，对应 phi 中心 = 1.5π。
    // 取球面中覆盖背面、并略带到两侧的弧片当披风：从肩部垂到腰部，上收下放，
    // 从正面看是干净的身体轮廓，只在背面/肩侧露出一抹斗篷，与裙色形成一层素雅层次。
    // 注意：裙子是下底半径 0.28 的锥台圆柱，披风 z 方向如只压到 0.7、又停在 z=-0.04，
    // 会被裙子背面(-0.28)整个包住而看不见——所以披风要往后凸出(z 更负) + 略加宽加长，让下摆拖出裙身。
    this.capeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#9c3e2e'),
      fog: true,
      side: THREE.DoubleSide,
    })
    // 披风的顶点波浪：下摆随风/步伐轻轻飘动，上肩锚定不动。
    // 用 onBeforeCompile 注入到披风专属材质里，不影响全局、不拖性能；
    // vertex 先取地理位置 position（本地位），再做波浪，再交回 begin_vertex 之后流程。
    this.capeUniforms = { uTime: { value: 0 }, uSway: { value: 0 } }
    this.capeMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.capeUniforms.uTime
      shader.uniforms.uSway = this.capeUniforms.uSway
      // 声明 uniform（挂在 <common> 后，所有 basic shader 都有这个 include）
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;\nuniform float uSway;',
      )
      // 波浪变形：披风几何体是半径 0.3 的球面弧片，本地 y 约从 0.22(肩) 到 -0.2(下摆)。
      // 把"轻晃"升级成真·布料飘起：波浪从肩部传向下摆（相位随 y 递增，形成一层层翻动），
      // 下摆既有前后抛(z)又有大幅上下翻(y)，走路时整个下摆还被风吹得往上扬。
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          'float capePhase = uTime * 3.4;',
          // 归一化高度链：肩部 t=0（贴背不动），下摆 t=1（最飘）
          'float capeT = clamp((0.22 - position.y) / 0.42, 0.0, 1.0);',
          // 传播相位：越往下摆相位越滞后，波浪看起来从底部一层层往上翻
          'float capeTrack = capeT * 2.8;',
          // 横向双频波 + 渐进的纵向传播分量
          'float capeWave = sin(position.x * 6.0 - capePhase + capeTrack) * 0.5'
            + ' + sin(position.x * 12.0 - capePhase * 1.7 + capeTrack * 1.4) * 0.3;',
          // 权重随下摆平方增大，再用 uSway 控制整体强弱
          'float capeBlend = capeT * capeT * uSway;',
          // 前后飘动：波浪本身有对称摆动，但整体偏置往负z（远离身体、被风往后吹），
          // 所以下摆一直被风往后拖、再叠一点翻摆，不会往身体方向卷。
          'float capePush = capeWave * 0.05;',
          'transformed.z -= (capePush + capeT * 0.16 * uSway) * capeBlend;',
          // 上下柔和起伏：不是剧烈上下砸，而是像布被风托起的轻波（幅度更柔和）
          'transformed.y += capeWave * 0.04 * capeBlend;',
          // 走路扬起：下摆整体被风托起（静止时忽略）
          'transformed.y += capeT * capeT * uSway * 0.08;',
        ].join('\n'),
      )
    }
    this.cape = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 20, 10, Math.PI * 1.15, Math.PI * 0.7, Math.PI * 0.24, Math.PI * 0.5),
      this.capeMat,
    )
    // 披风宽度收窄（1.25→1.0，更窄更贴身，不再是一大块披肩），下摆拖长(y 1.35 保持 1.3)，
    // z 保持 1.2 凸出裙身。窄身 + 长下摆，走动时才更像"一缕薄纱在背后飘"。
    this.cape.scale.set(1.0, 1.3, 1.2)
    this.cape.position.set(0, 0.46, -0.02)
    // 披风角度：微微前倾贴背（0.14→0.08），让披风更垂顺自然，看起来更像垂在背后的斗篷
    this.cape.rotation.x = 0.08
    this.cape.rotation.z = 0.03
    this.figure.add(this.cape)

    // ── 头：致敬艾达的素雅，但保留小满自己的记忆点 ──
    this.headGroup.position.set(0, 0.78, 0)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 16), skinMat)
    this.headGroup.add(head)
    // 头发：浅金棕色，包覆整个头、后面略垂
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 14), hairMat)
    hair.scale.set(1, 0.92, 1)
    hair.position.set(0, 0.04, -0.05)
    this.headGroup.add(hair)
    // 刘海：一缕垂在额前的小斜刘海，柔化纯素的脸——小满独有的灵动点，隔开与艾达的距离
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10), hairMat)
    fringe.scale.set(1.15, 0.62, 0.7)
    fringe.position.set(-0.07, 0.19, 0.19)
    fringe.rotation.z = 0.35
    this.headGroup.add(fringe)
    // 双丸子头：小满的标志性记忆点，做成略高的"小耳朵"，与艾达拉开距离
    this.bunL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), hairMat)
    this.bunL.position.set(-0.25, 0.22, -0.05)
    this.bunR = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), hairMat)
    this.bunR.position.set(0.25, 0.22, -0.05)
    this.headGroup.add(this.bunL, this.bunR)
    // 眼睛：安静但带暖意的棕点——艾达的极简是底子，暖棕是生命气，但不加白高光（不回到糖感）
    this.eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), eyeMat)
    this.eyeL.position.set(-0.092, 0.09, 0.245)
    this.eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), eyeMat)
    this.eyeR.position.set(0.092, 0.09, 0.245)
    this.headGroup.add(this.eyeL, this.eyeR)

    // ── 红尖帽：纪念碑谷艾达式——小圆顶 + 小尖，素雅的红色剪影 ──
    this.hatGroupSetup(redMat)
    this.headGroup.position.y = 0.78
    this.figure.add(this.headGroup)

    // ── 软阴影：把人钉在地面上的关键 ──
    this.shadowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#3a3630'),
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      fog: true,
    })
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), this.shadowMat)
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.015
    shadow.renderOrder = 0
    this.group.add(shadow)

    this.group.add(this.figure)
    // 整体瘦身：横向压缩 10%，身体更纤细修长（纪念碑谷角色本就偏修长，头也随之微收更协调）
    this.figure.scale.x = 0.9
    this.group.scale.setScalar(CONFIG.girl.scale)
  }

  private hatGroupSetup(redMat: THREE.Material): void {
    const hat = new THREE.Group()
    hat.position.set(0, 0.24, 0)
    hat.rotation.x = -0.04
    // 帽檐：较窄一圈，小红帽的经典轮廓（不大张旗鼓，剪影更优雅）
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 20), redMat)
    hat.add(brim)
    // 帽身：鼓起的圆顶，纪念碑谷艾达的标志红帽
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), redMat)
    crown.scale.set(1, 0.7, 1)
    crown.position.y = 0.05
    hat.add(crown)
    // 帽顶小尖冒：后翘收敛（0.35→0.18），不再显得帽子往后仰——端正但仍有一点设计感
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.18, 16), redMat)
    cone.position.set(0, 0.21, -0.01)
    cone.rotation.x = 0.18
    cone.rotation.z = -0.03
    hat.add(cone)
    this.headGroup.add(hat)
  }

  private makeLeg(side: -1 | 1, skinMat: THREE.Material, shoeMat: THREE.Material): THREE.Group {
    const g = new THREE.Group()
    g.position.set(side * 0.1, 0.34, 0)
    // 腿段加粗加长：0.05/0.2 → 0.06/0.24，腿更修长也更明显
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.24, 3, 8), skinMat)
    leg.position.y = -0.12
    g.add(leg)
    // 红鞋：加大更醒目，脚尖微微上扬一点点可爱；随腿加长而相应下移、略前伸
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), shoeMat)
    shoe.scale.set(1, 0.6, 1.4)
    shoe.position.set(0, -0.31, 0.035)
    shoe.rotation.x = -0.12
    g.add(shoe)
    return g
  }
  private makeArm(side: -1 | 1, mat: THREE.Material): THREE.Group {
    const g = new THREE.Group()
    g.position.set(side * 0.2, 0.46, 0)
    // 手臂加粗加长：0.042/0.16 → 0.05/0.18，胳膊更明显
    const geo = new THREE.CapsuleGeometry(0.05, 0.18, 3, 8)
    geo.translate(0, -0.12, 0)
    g.add(new THREE.Mesh(geo, mat))
    return g
  }

  setState(state: GirlState): void {
    this.state = state
  }

  /** 实时调整整体大小（调试面板拧 CONFIG.girl.scale 时调用，立即生效） */
  setScale(s: number): void {
    this.group.scale.setScalar(s)
  }

  /** 收集到东西 / 换幕时小跳一下 */
  hop(): void {
    if (this.hopT < 0) {
      this.hopT = 0
    }
  }

  /** 章节演出：让她沿路径点自动行走，走完回调（路径被风显形、她被石碑召唤） */
  setAutoPath(waypoints: THREE.Vector3[], onArrive?: () => void): void {
    this.autoWaypoints = waypoints
    this.autoIndex = 0
    this.onArrive = onArrive
  }

  /** 北延麦海的显形 0~1：由 App 每帧同步，决定她能向北走多远 */
  northOpen = 0
  /** 脚下地面高度（栈桥/船甲板），由 App 每帧设置；她的高度会平滑过渡 */
  groundY = 0
  /** 登船模式：位置与朝向由 App 每帧外部给定（跟随船），不再自主移动 */
  sailing = false
  /** 航行时 App 每帧写入的甲板站位与朝向 */
  externPos = new THREE.Vector3()
  externFacing = 0
  /** 栈桥行走带（北进坐标系 d/w），设置后她可以沿栈桥走到海上 */
  pierBand: { wMin: number; wMax: number; dMin: number; dMax: number } | null = null
  private curGroundY = 0

  clearAutoPath(): void {
    this.autoWaypoints = null
    this.onArrive = undefined
  }

  /** 重构/调试时将角色恢复到原点和默认运动状态。 */
  reset(): void {
    this.pos.copy(NEST)
    this.vel.set(0, 0, 0)
    this.target.copy(NEST)
    this.accel.set(0, 0, 0)
    this.group.position.set(0, 0, 0)
    this.group.rotation.y = 0
    this.figure.position.y = 0
    this.figure.rotation.x = 0
    this.facing = 0
    this.lastFacing = 0
    this.clearAutoPath()
    this.paused = false
    this.sailing = false
    this.groundY = 0
    this.curGroundY = 0
    this.hopT = -1
    this.hopLift = 0
    this.bobLift = 0
  }

  /** 光圈已按需求移除；warmth 微调裙子色调，intensity 参数保留接口一致性 */
  setAppearance(warmth: number, _intensity: number): void {
    this.dressMat.color.copy(this.dressCold).lerp(this.dressWarm, warmth)
  }

  /** 眨眼节拍：主流程与航行模式共用 */
  private updateBlink(dt: number, _time: number): void {
    this.blinkTimer -= dt
    if (this.blinkTimer <= 0 && this.blinkAnim < 0 && this.state !== 'dormant') {
      this.blinkAnim = 0
      this.blinkTimer = 2 + Math.random() * 3
    }
    if (this.blinkAnim >= 0) {
      this.blinkAnim += dt / 0.14
      const closed = this.blinkAnim < 0.5 ? 1 - this.blinkAnim * 2 : (this.blinkAnim - 0.5) * 2
      const eyeScale = 0.12 + 0.88 * Math.max(0, closed)
      this.eyeL.scale.y = eyeScale
      this.eyeR.scale.y = eyeScale
      if (this.blinkAnim >= 1) {
        this.blinkAnim = -1
        this.eyeL.scale.y = 1
        this.eyeR.scale.y = 1
      }
    }
  }

  update(dt: number, time: number, pointer: PointerState): void {
    const g = CONFIG.girl

    // ── 0. 航行模式：位置与朝向由船给出，跳过自主移动 ──
    if (this.sailing) {
      this.pos.copy(this.externPos)
      this.facing = this.externFacing
      this.curGroundY += (this.groundY - this.curGroundY) * Math.min(1, dt * 8)
      this.group.rotation.y = this.facing
      this.group.position.set(this.pos.x, this.curGroundY, this.pos.z)
      this.figure.position.y = 0
      this.collectAnchor.copy(this.pos).setY(this.groundY + 1.0)
      // 随海风的小动作：裙摆与丸子头飘、眨眼
      this.dress.rotation.z = Math.sin(time * 1.8) * 0.06
      this.bunL.rotation.z = Math.sin(time * 1.4) * 0.1
      this.bunR.rotation.z = -Math.sin(time * 1.4) * 0.1
      this.updateBlink(dt, time)
      return
    }

    // ── 1. 目标点由心智状态决定 ──
    if (this.autoWaypoints) {
      // 章节演出：沿路径点走；风不够（paused）时驻足等待，脚下的路才在
      if (this.paused) {
        this.target.set(this.pos.x, 0, this.pos.z)
      } else {
        const wp = this.autoWaypoints[Math.min(this.autoIndex, this.autoWaypoints.length - 1)]
        this.target.set(wp.x, 0, wp.z)
        if (Math.hypot(this.pos.x - wp.x, this.pos.z - wp.z) < 0.8) {
          this.autoIndex++
          if (this.autoIndex >= this.autoWaypoints.length) {
            this.autoWaypoints = null
            const cb = this.onArrive
            this.onArrive = undefined
            cb?.()
          }
        }
      }
    } else if (this.paused) {
      this.target.set(this.pos.x, 0, this.pos.z)
    } else {
      switch (this.state) {
      case 'dormant':
        // 打盹：谁都叫不动，站在原地（或慢慢踱回原地）
        this.target.copy(NEST)
        break
      case 'waking': {
        // 半醒：自己在麦田里散步，但手指的位置会明显牵引她——试探，不是无视
        this.target.set(
          Math.cos(time * 0.16) * (g.wanderAmp + 1.2),
          0,
          Math.sin(time * 0.21) * (g.wanderAmp + 1.2),
        )
        if (pointer.active) {
          this.scratch.subVectors(pointer.world, this.target).setY(0).multiplyScalar(0.55)
          this.target.add(this.scratch)
        }
        break
      }
      case 'bonded':
        // 认得你了：手指指哪走到哪
        this.target.set(pointer.world.x, 0, pointer.world.z)
        break
      }
    }

    // 好奇：偶尔朝旁边绕一步看看（只在水平面；自动寻路时不乱看）
    if (this.state !== 'dormant' && !this.autoWaypoints) {
      this.target.x += wobble(time * 0.24, 5.1) * g.curiosityAmp
      this.target.z += wobble(time * 0.27, 9.3) * g.curiosityAmp
    }

    // ── 2. 弹簧 + 步速上限：走路不是滑行 ──
    const k = g.stiffness
    const c = 2 * Math.sqrt(k) * g.dampingRatio
    this.accel.set(this.target.x - this.pos.x, 0, this.target.z - this.pos.z).multiplyScalar(k)
    this.accel.addScaledVector(this.vel, -c)
    this.vel.addScaledVector(this.accel, dt)
    const maxSp = g.maxSpeed * (this.state === 'bonded' ? 1.15 : 1)
    const sp = this.vel.length()
    if (sp > maxSp) this.vel.multiplyScalar(maxSp / sp)
    this.pos.addScaledVector(this.vel, dt)

    // 活动范围：用"北进深度 d / 横向 w"表达，全程随位置连续变化——无瞬移。
    // 家在 d ∈ [-20, 15]；北延打开后到水线；越过水线时走廊连续收窄成栈桥宽度、
    // 深度延伸到桥尾（栈桥中心在 w = -2.5）。她沿栈桥走到海上、再原路走回来都平滑。
    const dNorth = -(this.pos.x + this.pos.z) * 0.7071
    const wSide = (this.pos.x - this.pos.z) * 0.7071
    const pierOpen = clamp((dNorth - (CONFIG.sea.start - 1)) / 4, 0, 1) * this.northOpen
    const dMax = 15 + this.northOpen * (CONFIG.sea.start - 13) + pierOpen * 13
    const wCenter = -2.5 * pierOpen
    const wHalf = 20 - pierOpen * 18.6
    const dClamp = clamp(dNorth, -20, dMax)
    // 登船走道：栈桥尽头（d > 86）可以走向左舷外——那里停着帆船
    let wLow = wCenter - wHalf
    if (dClamp > 86) wLow -= 4.5 * clamp((dClamp - 86) / 3, 0, 1)
    const wClamp = clamp(wSide, wLow, wCenter + wHalf)
    this.pos.x = (wClamp - dClamp) * 0.7071
    this.pos.z = -(dClamp + wClamp) * 0.7071

    // ── 3. 面朝移动方向，最短角插值转身 ──
    const speed = this.vel.length()
    if (speed > 0.25) {
      const want = Math.atan2(this.vel.x, this.vel.z)
      let d = want - this.facing
      d = Math.atan2(Math.sin(d), Math.cos(d))
      this.facing += d * Math.min(1, dt * g.turnLerp)
    }
    this.group.rotation.y = this.facing
    // 脚下地面高度平滑过渡：上栈桥/下栈桥不跳变
    this.curGroundY += (this.groundY - this.curGroundY) * Math.min(1, dt * 6)
    this.group.position.set(this.pos.x, this.curGroundY, this.pos.z)

    // ── 4. 走路动画：全部由实际速度推导，一动全动 ──
    // 滞回判定：>0.25 进入走动，<0.12 归位静止，中间保持上次状态。
    // 指针停住时目标点仍会因好奇微晃，速度在 0.2 附近反复横跳，
    // 单阈值会让"走/停"来回闪——滞回把这个抖动抹掉。
    const speedH = speed
    const moving = this.wasMoving ? speedH > 0.12 : speedH > 0.25
    this.wasMoving = moving
    const gait = Math.min(1, Math.max(0, speedH / 1.8))
    if (moving) this.bobPhase += dt * (5.2 + speedH * 1.6)
    const s = Math.sin(this.bobPhase)

    // 双腿交替：摆动 + 抬脚（抬的是向前摆的那条）——幅度稍微收敛，走路更稳、下身不晃
    const legSwing = s * (0.24 + gait * 0.26)
    if (moving) {
      this.legL.rotation.x = legSwing
      this.legR.rotation.x = -legSwing
      this.legL.position.y = 0.34 + Math.max(0, s) * 0.04 * gait
      this.legR.position.y = 0.34 + Math.max(0, -s) * 0.04 * gait
    } else {
      // 站立：双腿并拢落地（阻尼收敛，别硬跳）
      const settle = Math.min(1, dt * 12)
      this.legL.rotation.x += (0 - this.legL.rotation.x) * settle
      this.legR.rotation.x += (0 - this.legR.rotation.x) * settle
      this.legL.position.y += (0.34 - this.legL.position.y) * settle
      this.legR.position.y += (0.34 - this.legR.position.y) * settle
    }

    // 身体颠簸：只在走动时叠加；静止时平滑归零，绝不让小人站住了还上下动。
    // bobLift 采用一次平滑逼近，走动时缓慢升起、静止时缓缓落地。
    const bobTarget = moving ? Math.abs(Math.cos(this.bobPhase)) * (0.018 + gait * 0.024) : 0
    this.bobLift += (bobTarget - this.bobLift) * Math.min(1, dt * 10)
    this.figure.position.y = this.bobLift + this.hopLift
    // 走路前倾收敛：0.04→0.025，让头不致在走路时明显前倾
    this.figure.rotation.x = moving ? 0.025 * gait : 0

    // 手臂摆动：走动时反转摆；静止时轻微呼吸（幅度极小，且带阻尼，不会晃动）
    // 摆幅收小一档，与收紧的下身协调，不至于上身比下身还晃
    const swing = moving ? -s * (0.16 + gait * 0.3) : Math.sin(time * 1.7) * 0.02
    this.armL.rotation.x = swing
    this.armR.rotation.x = -swing

    // 裙摆：走动时随步伐轻摆；静止时归零，不再用 time 做持续缩放（那个就是"站住还上下动"的元凶之一）
    this.dress.rotation.z = moving ? s * 0.045 * gait : 0
    this.dress.scale.y = moving ? 1 + Math.abs(s) * 0.02 * gait : 1
    // 披肩：走路时随步伐轻微前后摆 + 整体上飘（"飘"的姿态），静止垂落归零
    // 走路时上扬幅度加大(gait*0.16)，让披风明显"飘起来"；起伏用低速 s 更柔
    this.cape.rotation.x = moving ? 0.06 + s * 0.04 * gait + gait * 0.16 : 0
    // 披风顶点波浪：uTime 持续流动。
    // uSway = 布料"被风吹起来"的程度——走路时拉满(1)，静止时几乎垂落(0.05，仅极轻微风拂)。
    // 过渡用慢速平滑(dt*3)，飘起/垂落都更柔和，不会突兀。
    this.capeUniforms.uTime.value = time
    const capeSwayTarget = moving ? 1 : 0.05
    this.capeSway += (capeSwayTarget - this.capeSway) * Math.min(1, dt * 3)
    this.capeUniforms.uSway.value = this.capeSway

    // 丸子头：朝移动的反方向甩，带一点弹性
    const bunWant = clamp(-this.facingDelta() * 0.6, -0.3, 0.3) * (moving ? 1 : 0)
    this.bunSwing += (bunWant - this.bunSwing) * Math.min(1, dt * 8)
    this.bunL.position.y = 0.18 + Math.abs(Math.cos(this.bobPhase)) * 0.012 * gait
    this.bunR.position.y = 0.18 + Math.abs(Math.cos(this.bobPhase)) * 0.012 * gait
    this.bunL.rotation.z = this.bunSwing
    this.bunR.rotation.z = this.bunSwing

    // 头：打盹时低头，醒了抬头 + 好奇地张望
    const tiltWant = this.state === 'dormant' ? 0.5 : 0
    this.headTilt += (tiltWant - this.headTilt) * Math.min(1, dt * 2.5)
    this.headGroup.rotation.x = this.headTilt
    this.headGroup.rotation.y = this.state === 'dormant' ? 0 : wobble(time * 0.3, 7.7) * 0.4 * (1 - gait * 0.6)

    this.updateBlink(dt, time)

    // 小跳：独立通道 hopLift（走路颠簸 bobLift 不与它叠加冲突）
    if (this.hopT >= 0) {
      this.hopT += dt * 2.1
      if (this.hopT >= 1) {
        this.hopT = -1
        this.hopLift = 0
      } else {
        this.hopLift = Math.sin(this.hopT * Math.PI) * 0.2
      }
    }

    // 影子随起跳缩小变淡
    const lift = this.figure.position.y
    this.shadowMat.opacity = 0.16 - Math.max(0, lift) * 0.4

    this.collectAnchor.set(this.pos.x, 0.8 * CONFIG.girl.scale, this.pos.z)
  }

  /** 上一帧到这一帧的朝向变化量（转身时甩丸子头用） */
  private lastFacing = 0
  private facingDelta(): number {
    let d = this.facing - this.lastFacing
    d = Math.atan2(Math.sin(d), Math.cos(d))
    this.lastFacing = this.facing
    return d
  }

  get position(): THREE.Vector3 {
    return this.pos
  }

  get speed(): number {
    return this.vel.length()
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })
    this.dressMat.dispose()
    this.capeMat.dispose()
    this.shadowMat.dispose()
  }
}
