import * as THREE from 'three'
import haloFrag from '../shaders/halo.frag.glsl?raw'
import haloVert from '../shaders/halo.vert.glsl?raw'

/**
 * 小帆船：停泊在栈桥旁 → 小满登船 → 可驾驶航行，驶出海湾进入第二章。
 *
 * 驾驶模型（开船的手感）：
 *   - 手指点向哪里，船就缓缓转向那个方向（转向速率有上限——船有惯性）；
 *   - 船始终以巡航速度前进，"升帆"（手部张开/鼠标按住）时帆鼓起、加速；
 *   - 船尾拖出白色浪迹粒子。
 */
export class Boat {
  readonly group = new THREE.Group()
  /** 船的世界位置（供摄像机/登船判定） */
  readonly boatSpot = new THREE.Vector3()
  /** 甲板站位（小满登船后站在这里），世界坐标，每帧更新 */
  readonly deckSpot = new THREE.Vector3()
  /** 船头朝向的世界方向向量，每帧更新 */
  readonly forward = new THREE.Vector3(-0.7071, 0, -0.7071)

  private readonly deckMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#a8845c'), fog: true })
  private readonly beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8a6a48'), fog: true })
  private readonly creamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f0e6d0'), fog: true })
  private readonly flagMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#c0453a'), side: THREE.DoubleSide, fog: true })
  private readonly sailMat: THREE.MeshBasicMaterial
  private readonly sail: THREE.Mesh
  private readonly flag: THREE.Mesh
  private readonly lampMats: THREE.ShaderMaterial[] = []

  private readonly moor = new THREE.Vector3()
  private heading = 0 // 0 = 朝北
  private speed = 0
  private pos = new THREE.Vector3()
  /** 航行中 */
  sailing = false
  /** 累计航程（世界单位），App 用它判断切换场景 */
  sailDist = 0
  /** 帆的鼓起程度 0~1（油门），驱动帆形与速度 */
  sailFill = 0

  // 尾迹粒子池
  private readonly wakePool: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; drift: THREE.Vector3 }[] = []
  private wakeTimer = 0
  private readonly wakeGeo = new THREE.SphereGeometry(0.12, 6, 5)

  constructor(moorX: number, moorZ: number) {
    this.moor.set(moorX, 0, moorZ)
    this.pos.copy(this.moor)
    this.group.position.copy(this.moor)

    // ── 船体（纪念碑谷式：胶囊圆头圆尾 + 平甲板 + 船舱 + 船头装饰） ──
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.0, 6, 12), this.beamMat)
    hull.rotation.x = Math.PI / 2
    hull.scale.set(1.15, 0.62, 1)
    hull.position.y = 0.3
    this.group.add(hull)
    const boatDeck = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 3.5), this.deckMat)
    boatDeck.position.y = 0.52
    this.group.add(boatDeck)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.42, 0.85), this.creamMat)
    cabin.position.set(0, 0.75, -0.5)
    this.group.add(cabin)
    const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 0.95), this.beamMat)
    cabinRoof.position.set(0, 0.99, -0.5)
    this.group.add(cabinRoof)

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.7, 8), this.beamMat)
    mast.position.set(0, 2.1, 0.3)
    this.group.add(mast)
    // 主帆：微微弯曲，随帆的鼓起放大
    const sailGeo = new THREE.PlaneGeometry(1.9, 2.2, 6, 6)
    const sp = sailGeo.getAttribute('position')
    for (let i = 0; i < sp.count; i++) {
      sp.setZ(i, Math.sin(((sp.getX(i) + 0.95) / 1.9) * Math.PI) * 0.24)
    }
    sailGeo.computeVertexNormals()
    this.sailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fdf6e3'), side: THREE.DoubleSide, fog: true })
    this.sail = new THREE.Mesh(sailGeo, this.sailMat)
    this.sail.position.set(0.05, 2.05, 0.15)
    this.sail.rotation.y = 0.12
    this.group.add(this.sail)
    // 红帆小旗：呼应小满的红帽子
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.28), this.flagMat)
    this.flag.position.set(0.3, 3.3, 0)
    this.group.add(this.flag)
    // 船头小灯
    const lampMat = new THREE.ShaderMaterial({
      vertexShader: haloVert,
      fragmentShader: haloFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color('#ffd97d') },
        uOpacity: { value: 0.55 },
        uPower: { value: 2.2 },
      },
    })
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), lampMat)
    lamp.position.set(0, 0.72, 1.75)
    this.group.add(lamp)
    this.lampMats.push(lampMat)
  }

  /** 登船：进入可驾驶状态 */
  depart(): void {
    this.sailing = true
    this.speed = 0
  }

  /** 她走到船边时调用：灯全亮、帆微鼓——船"醒"了 */
  wake(): void {
    for (const m of this.lampMats) {
      m.uniforms.uOpacity.value = 0.85
    }
  }

  /** 停回泊位（重置） */
  reset(): void {
    this.sailing = false
    this.speed = 0
    this.sailDist = 0
    this.sailFill = 0
    this.pos.copy(this.moor)
    this.heading = 0
    this.group.position.copy(this.moor)
    this.group.rotation.set(0, -Math.PI * 0.75, 0)
    for (const w of this.wakePool) {
      this.group.remove(w.mesh)
      w.mat.dispose()
    }
    this.wakePool.length = 0
  }

  /**
   * @param steer    转向输入 -1（左）~1（右）
   * @param throttle 帆的鼓起 0~1（升帆程度）
   */
  update(dt: number, time: number, steer: number, throttle: number): void {
    // 帆的鼓起：帆面放大 + 微转
    this.sailFill += (throttle - this.sailFill) * Math.min(1, dt * 3)
    this.sail.scale.set(1 + this.sailFill * 0.18, 1 + this.sailFill * 0.1, 1)
    this.sail.rotation.y = 0.12 - this.sailFill * 0.1

    if (this.sailing) {
      // 目标速度：巡航 3.0 + 升帆 3.8；惯性趋近
      const targetSpeed = 3.0 + this.sailFill * 3.8
      this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 0.55)
      // 转向：速率随速度提升（静止的船转不动）
      this.heading -= steer * 0.55 * dt * (0.35 + this.speed * 0.16)
      // 前进
      const fx = -0.7071 * Math.cos(this.heading) + 0.7071 * Math.sin(this.heading)
      const fz = -0.7071 * Math.sin(this.heading) - 0.7071 * Math.cos(this.heading)
      this.forward.set(fx, 0, fz)
      this.pos.addScaledVector(this.forward, this.speed * dt)
      this.sailDist += this.speed * dt

      // 不上岸：船只待在深水区（d ≥ 76.5，横向 ±30，d ≤ 150），搁浅即减速
      const dNow = -(this.pos.x + this.pos.z) * 0.7071
      const wNow = (this.pos.x - this.pos.z) * 0.7071
      let grounded = false
      if (dNow < 76.5) {
        const push = 76.5 - dNow
        this.pos.x += -0.7071 * push
        this.pos.z += -0.7071 * push
        grounded = true
      }
      if (dNow > 148) {
        const push = dNow - 148
        this.pos.x += 0.7071 * push
        this.pos.z += 0.7071 * push
        grounded = true
      }
      if (Math.abs(wNow) > 30) {
        const push = Math.abs(wNow) - 30
        const sgn = Math.sign(wNow)
        this.pos.x += 0.7071 * push * sgn
        this.pos.z += -0.7071 * push * sgn
        grounded = true
      }
      if (grounded) this.speed *= Math.max(0, 1 - dt * 4)

      // 尾迹浪花
      this.wakeTimer += dt
      if (this.speed > 0.9 && this.wakeTimer > 0.22) {
        this.wakeTimer = 0
        this.spawnWake()
      }
      // 转向侧倾
      this.group.rotation.z += (-steer * 0.05 * Math.min(1, this.speed / 4) - this.group.rotation.z) * Math.min(1, dt * 2)
    }

    // 位置与朝向
    this.group.position.copy(this.pos)
    this.group.position.y = 0.02 + Math.sin(time * 0.9) * 0.09
    this.group.rotation.y = Math.atan2(this.forward.x, this.forward.z)
    this.group.rotation.x = Math.sin(time * 0.52) * 0.035

    // 旗子飘
    this.flag.rotation.y = Math.sin(time * 2.6) * 0.5 - steer * 0.4
    // 灯笼呼吸
    for (let i = 0; i < this.lampMats.length; i++) {
      const m = this.lampMats[i]
      m.uniforms.uOpacity.value = 0.55 + Math.sin(time * 1.7 + i * 1.3) * 0.12
    }

    // 尾迹粒子推进
    for (let i = this.wake.length - 1; i >= 0; i--) {
      const w = this.wakePool[i]
      w.life += dt / 2.2
      if (w.life >= 1) {
        this.group.remove(w.mesh)
        w.mat.dispose()
        this.wakePool.splice(i, 1)
        continue
      }
      w.mesh.position.addScaledVector(w.drift, dt)
      w.mesh.scale.setScalar(0.4 + w.life * 1.1)
      w.mat.opacity = 0.65 * (1 - w.life)
    }

    // 世界坐标输出
    this.boatSpot.copy(this.pos)
    this.boatSpot.y = 0.6 + Math.sin(time * 0.9) * 0.09
    // 甲板站位：船中前部
    this.deckSpot.copy(this.pos).addScaledVector(this.forward, 0.55)
    this.deckSpot.y = 0.62 + Math.sin(time * 0.9) * 0.09
  }

  private spawnWake(): void {
    const back = this.forward.clone().multiplyScalar(-2.1)
    const side = (Math.random() - 0.5) * 1.6
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#fffdf4'),
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    })
    const mesh = new THREE.Mesh(this.wakeGeo, mat)
    mesh.position.copy(this.pos).add(back)
    mesh.position.x += side * 0.5
    mesh.position.z += side * 0.5 * 0.3
    mesh.position.y = 0.05
    const drift = this.forward.clone().multiplyScalar(-0.6)
    drift.x += (Math.random() - 0.5) * 0.3
    drift.z += (Math.random() - 0.5) * 0.3
    this.wakePool.push({ mesh, mat, life: 0, drift })
    this.group.add(mesh)
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

