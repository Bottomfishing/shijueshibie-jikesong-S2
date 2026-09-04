import * as THREE from 'three'

/**
 * 乌鸦——麦田里的一对活物。
 *
 * 纯几何纪念碑谷风：深墨色胶囊身体 + 短桶尾 + 半球头 + 几何尖喙 +
 * 一圈白色"醒目眼环" + 两片能收能展的低多边形翅膀。
 *
 * 两只：
 *  - 树上那只（视觉主角）：栖在枯树枝头，按摘花进度做三段式演出——
 *      警觉(偏头打量小满) → 躁动(翅膀半张急促点头) → 飞走(蹬枝起飞、朝北盘旋远去、淡出)。
 *  - 地上那只（呼应）：停在麦田边，树上那只飞走时它也惊起，低空掠过朝北飞去。
 *
 * 玩家摘花进度驱动：collected 0→3，规则简单——
 *  collected < 2  = 警觉（相安无事，偏头看她）
 *  collected == 2 = 躁动（它意识到什么，开始不安）
 *  collected >= 3 = 飞走（最后一朵花摘完，它带路般朝北飞去）
 *
 * 不新增粒子系统，纯粹是低多边形 Mesh + 程序化节奏，几乎不耗性能。
 */
export class Crows {
  readonly group = new THREE.Group()

  /** 枯树枝头的栖点（世界坐标），由 App 在构造后设置 */
  perchSpot = new THREE.Vector3()
  /** 地上那只的落点（世界坐标），由 App 构造成员方法时设置 */
  groundSpot = new THREE.Vector3()
  /** 栖枝高度：乌鸦停在枝头时的 y。
   *  直接用 perchSpot.y（枝梢世界高度）+ 一个小的贴枝偏移，
   *  这样把栖点换到任意一根枝（D 顶梢）都自动贴上去，不会悬空。
   *  偏移取 0.06，让身体中心略高于枝梢、看起来"站"在枝上。 */
  private readonly perchYOffset = 0.06

  /** 乌鸦材质固定纯黑剪影，不受环境(雾/天色)变色影响——像纪念碑谷的石像，黑就是黑 */
  private readonly crowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#161311'), fog: false })
  private readonly beakMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#161311'), fog: false })
  private readonly eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f4efe2'), fog: false })

  /** 树上主角 */
  private readonly prime: AliveCrow
  /** 地上配角 */
  private readonly second: AliveCrow

  /** 飞走阶段锁定：一旦进入飞走就不再回退 */
  private departed = false
  /** 起飞计时（秒）：主角/配角各自计时 */
  private departT = 0
  /** 上一帧 dt，供 animateDeparture 做位置累积 */
  private lastDt = 0.016
  /** 整只乌鸦的缩放：正交视锥高 30，身体仅 ~0.5 高，不放大就是个黑点。3 倍略大，2.2 更秀气（用户要求小一点） */
  private static readonly SCALE = 2.2

  /**
   * 起飞方向（世界坐标、已单位化）：主要向上(+y)，同时向场景深处(-x,-z，即西北远景/海平线)倾斜。
   * 为什么必须是这个方向：相机在 (21,30,21) 朝 (-2.2,0,-2.2) 看，镜头在 +z 一侧。
   * 旧代码 `position.z += dt*0.6` 朝 +z 飘 = 朝玩家脸上飞，正交下读作"原地浮空"。
   * 这只沿本方向爬升：y 抬升冲过树冠，-x/-z 绕开相机、退向远处海平线，才像真的"飞进天上"。
   */
  private static readonly SOAR = new THREE.Vector3(-0.32, 0.9, -0.32).normalize()

  constructor() {
    this.prime = this.buildCrow()
    this.second = this.buildCrow()
    // 整只放大，否则在 30 高正交视锥里是个看不清的黑点。
    // 用 multiplyScalar：保留 buildCrow 里设的横向侧扁(0.72)，不被 setScalar 覆盖
    this.prime.root.scale.multiplyScalar(Crows.SCALE)
    this.second.root.scale.multiplyScalar(Crows.SCALE)
    // 配角直接进组，但栖在地面落点上
    this.group.add(this.prime.root)
    this.group.add(this.second.root)
  }

  /**
   * 让两只乌鸦的剪影面(±z 的剪纸面)都朝向机位——由 App 在设好落点后调用一次。
   * 这是**一次性静态朝向**（toward 全景机位），不是跟着小满动态转，满足"乌鸦别旋转"，
   * 同时保证玩家能看清完整的鸟形剪影。
   *
   * 关键：剪影薄片沿 ±z 展开（挤出厚度在 z），所以要让 bird 的 z 轴指向相机，
   * 镜头里才是完整的"侧面鸟形"；否则像现在地面那只 -1.2 转向后，薄片侧棱(0.09)
   * 对着镜头，只剩一根黑条。
   */
  faceDefaultCamera(cam: THREE.Vector3): void {
    this.faceToward(this.prime, this.perchSpot, cam)
    this.faceToward(this.second, this.groundSpot, cam)
  }

  /** 绕 y 轴把 bird 的 +z(剪影面法线) 转到指向 cam：即 bird 的剪纸面正对镜头 */
  private faceToward(bird: AliveCrow, posFrom: THREE.Vector3, cam: THREE.Vector3): void {
    const dx = cam.x - posFrom.x
    const dz = cam.z - posFrom.z
    if (dx === 0 && dz === 0) return
    bird.root.rotation.y = Math.atan2(dx, dz)
  }

  /**
   * 构建一只乌鸦——纪念碑谷式**立体剪纸**。
   * 核心思路：整只鸟的身体+头+尾+喙用 THREE.Shape 画出二维轮廓，再 ExtrudeGeometry 挤出
   * 成"有厚度的薄片"。不管哪个视角，它都是一只完整的鸟，不再是零件拼装。
   * 剪影在 XY 平面展开（鸟立着，正面朝 +z 观看），挤出厚度在 z。
   */
  private buildCrow(): AliveCrow {
    const root = new THREE.Group()
    const d = 0.09 // 薄片厚度（剪纸感）

    // ── 身体剪影：圆头 → 短钝喙(-x) → 颈 → 背 → 短尾(+x)，一只侧立小乌鸦的干净剪影 ──
    // 去掉"小鬼感"：头要圆、喙要短钝（不是长尖朝下）、颈线要收出一段、尾巴又短又翘。
    const shape = new THREE.Shape()
    shape.moveTo(0.00, 0.26) // 头顶（圆弧顶点）
    shape.quadraticCurveTo(-0.06, 0.27, -0.08, 0.19) // 圆头后脑（控制点抬高让顶更圆润）
    shape.lineTo(-0.13, 0.15) // 短钝喙（朝前，不朝下）
    shape.lineTo(-0.07, 0.12) // 喙下/下巴
    shape.quadraticCurveTo(-0.05, 0.06, -0.02, 0.00) // 颈线收紧
    shape.bezierCurveTo(0.01, -0.06, 0.03, -0.10, 0.06, -0.15) // 胸→腹→尾根
    shape.lineTo(0.15, -0.19) // 尾上缘（更短）
    shape.lineTo(0.19, -0.15) // 尾尖微翘
    shape.quadraticCurveTo(0.13, -0.04, 0.06, 0.04) // 背脊
    shape.quadraticCurveTo(0.055, 0.16, 0.00, 0.26) // 后颈回头顶（控制点抬高，头顶圆弧收拢不落尖角）
    shape.closePath()

    // 挤出成薄片，就立在 XY 平面不旋转（鸟正面朝 +z 观看者）
    const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false })
    const body = new THREE.Mesh(bodyGeo, this.crowMat)
    body.position.z = 0 // 薄片中心对齐根
    root.add(body)

    // ── 眼睛：一点亮白，贴在头位（头已压低到 y≈0.26，眼睛随之）──
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), this.eyeMat)
    eye.position.set(-0.02, 0.18, 0.09)
    root.add(eye)

    // ── 翅膀 ×2：独立薄片，绕肩枢轴展开（开合/扇动）──
    const wingL = this.buildWing(-1)
    const wingR = this.buildWing(1)
    root.add(wingL, wingR)

    // 剪影上下略压、并把鸟"立正"一点；轻微前倾，像停在枝头低头张望的活鸟
    root.scale.set(1, 0.9, 1)
    root.rotation.x = 0.12
    return { root, body, head: body, beak: body, eye, wingL, wingR }
  }

  /** 一片收拢的薄翅：从肩部向后下方收成一道"翼刀"，贴住身体——
   *  不是展开的飞羽，而是停栖时收在体侧的小翼。鸟不展翅。随新身体缩小、更凝练。 */
  private buildWing(side: -1 | 1): THREE.Group {
    const pivot = new THREE.Group()
    pivot.position.set(0, 0.06, 0.02)
    pivot.rotation.y = side * 0.05 // 微微朝两侧分开、贴住双肋，绝不外展

    const ws = new THREE.Shape()
    // 翼刀轮廓：肩(0,0) → 沿体侧向后下收尖 → 回到肩（尺寸收紧，配合小巧身材）
    ws.moveTo(0, 0)
    ws.quadraticCurveTo(-0.02, -0.05, -0.05, -0.12) // 前缘贴体侧下收
    ws.quadraticCurveTo(-0.08, -0.17, -0.12, -0.19) // 翼尖(向后下、尖锐)
    ws.quadraticCurveTo(-0.09, -0.08, -0.02, -0.02) // 后缘收回肩
    ws.closePath()

    const wg = new THREE.ExtrudeGeometry(ws, { depth: 0.04, bevelEnabled: false })
    const wing = new THREE.Mesh(wg, this.crowMat)
    wing.position.set(side * 0.04, 0, 0)
    pivot.add(wing)
    return pivot
  }

  /** 摘花进度：App 每帧传入 collected(0~3) 与时间，驱动三段式演出（乌鸦固定朝向，不随小满转） */
  update(dt: number, time: number, collected: number, _girlPos: THREE.Vector3): void {
    this.lastDt = dt
    // 配角出场：主角飞走时才惊起；否则一直待在家的草坪(空旷、麦子让开)上，抬高到麦子以上可见
    this.second.root.position.copy(this.groundSpot)

    if (this.departed) {
      // 飞走阶段：主角带走配角，双双朝北飞远、缩小、淡出
      this.departT += dt
      this.animateDeparture(this.prime, this.departT)
      this.animateDeparture(this.second, Math.max(0, this.departT - 0.5))
      return
    }

    // 主角栖在枝头：y 直接用枝梢世界高度(perchSpot.y) + 贴枝偏移，换枝自动贴合不悬空
    this.prime.root.position.set(this.perchSpot.x, this.perchSpot.y + this.perchYOffset, this.perchSpot.z)

    if (collected < 2) {
      // 警觉：停在枝头，头缓慢偏转打量，偶尔扑一下翅膀
      this.animateAlert(this.prime, time)
    } else if (collected === 2) {
      // 躁动：翅膀半张、急促点头（它意识到什么）
      this.animateRestless(this.prime, time)
    } else {
      // 摘满 3 朵：起飞
      this.beginDeparture()
    }

    // 地上配角：一直待在地面，轻微啄食
    this.animateSecond(this.second, time)
  }

  /** 警觉：静止停在枝头。乌鸦身子绝不动——头即整片剪影，一旦偏头就是整只鸟在转，所以全部归零 */
  private animateAlert(c: AliveCrow, _time: number): void {
    c.head.rotation.set(0, 0, 0)
    c.wingL.rotation.z = 0
    c.wingR.rotation.z = 0
    c.body.position.y = 0
  }

  /** 躁动：身子也绝不动（头即整片剪影），仅翅膀贴肋微颤传递紧张感，不开合不点头 */
  private animateRestless(c: AliveCrow, time: number): void {
    c.head.rotation.set(0, 0, 0)
    c.body.position.y = 0
    // 翅膀收拢，仅轻微随呼吸颤动（不开合、不带动身子）
    c.wingL.rotation.z = Math.sin(time * 12) * 0.04
    c.wingR.rotation.z = -Math.sin(time * 12) * 0.04
  }

  /** 地上配角：静止站草地边。身子绝不动（头即整片剪影，啄食=整只鸟前倾，宁可不做） */
  private animateSecond(c: AliveCrow, _time: number): void {
    c.head.rotation.set(0, 0, 0)
    c.wingL.rotation.z = 0
    c.wingR.rotation.z = 0
  }

  /** 标记起飞：主角进入飞走段，配角也会随后惊起 */
  private beginDeparture(): void {
    if (this.departed) return
    this.departed = true
    this.departT = 0
  }

  /**
   * 飞走：第一幕结束（摘满 3 朵花），乌鸦**像真鸟起飞**——
   * 蹬枝弹起 → 快速扑翅 → 沿"向上+向场景深处"的方向斜向爬升，冲出树冠、飞向天顶，离屏后隐藏。
   * 全程**保持固定大小**（不缩小，避免"纸片缩没"的丑感），靠位移离开画面。
   * 位移沿 Crows.SOAR（-x,-z,+y 归一），绕开相机、退向海平线，是"飞进天空"而不是"原地浮空"。
   * @param t 起飞后的时长（秒），配角传 "主角时刻 - 半拍"
   */
  private animateDeparture(c: AliveCrow, t: number): void {
    if (t <= 0) {
      // 还没轮到它起飞，原地待命（翅膀收拢）
      c.wingL.rotation.z = 0
      c.wingR.rotation.z = 0
      c.root.rotation.x = 0.12
      return
    }
    // ── 阶段 1：蹬枝起跳（t<0.18）——身体先往上弹一下、蓄力，翅膀往后压 ──
    // ── 阶段 2：扑翅爬升（t 0.18~1.2）——翅膀快速大幅扑打，身体前倾朝上，持续斜向抬升 ──
    // ── 阶段 3：滑翔远去（t>1.2）——翅膀转为平缓小幅摆动，身形冲出屏幕顶后隐藏 ──
    const hop = Math.max(0, 1 - t / 0.18) // 0→1 快速衰减：起跳蹬力
    // 快速扑翅：起飞时翼幅大、频率快；升空后翼幅收小、频率放缓
    const amp = t < 0.35 ? 0.9 : t < 1.2 ? 0.55 : 0.28
    const freq = t < 0.35 ? 16 : t < 1.2 ? 11 : 7
    const flap = Math.sin(t * freq) * amp
    // 基础展角：越飞越平稳（起飞扑腾时翅膀张开，滑翔时收拢一点）
    const spread = Math.max(0.15, 0.6 - t * 0.35)
    c.wingL.rotation.z = spread + flap
    c.wingR.rotation.z = -(spread + flap)

    // 姿态：起飞时前倾抬头朝上，升空后逐渐回正成滑翔
    const pitch = 0.12 + Math.max(0, 0.6 - t * 0.5)
    c.root.rotation.x = pitch

    // ── 位移：沿 SOAR 方向斜向爬升 -> 越飞越高、越飞越深，不做缩小 ──
    // 用 while 处理 dt 大（掉帧lows）时仍走足距离，保证轨迹轨迹连续
    let remain = this.lastDt
    const speed = 3.6 + hop * 2.5 // 起跳那一下更快
    while (remain > 0) {
      const step = Math.min(remain, 0.05)
      c.root.position.addScaledVector(Crows.SOAR, speed * step)
      remain -= step
    }
    // 保持固定大小（不缩小），飞出屏幕顶/深处后隐藏
    c.root.scale.set(Crows.SCALE, Crows.SCALE * 0.9, Crows.SCALE)
    if (c.root.position.y > 46) c.root.visible = false
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })
    this.crowMat.dispose()
    this.beakMat.dispose()
    this.eyeMat.dispose()
  }
}

/** 一只活乌鸦的可动画部件 */
interface AliveCrow {
  root: THREE.Group
  body: THREE.Mesh
  head: THREE.Mesh
  beak: THREE.Mesh
  eye: THREE.Mesh
  wingL: THREE.Group
  wingR: THREE.Group
}
