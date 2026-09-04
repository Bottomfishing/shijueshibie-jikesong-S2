import GUI from 'lil-gui'
import { CONFIG } from '../config'
import type { PointerState } from '../types'
import type { App } from '../core/App'

/**
 * 调试面板（lil-gui）。
 *
 * 比赛的 30-36 小时是美术调校时间——那 6 个小时的产出质量，
 * 基本取决于这个面板好不好用。所有能想到要现场拧的参数都在这了：
 * D 键开关，参数改完立即生效，不用刷新。
 */
export class DebugPanel {
  private readonly gui: GUI

  private readonly stats = {
    fps: 0,
    act: 1 as number,
    input: '手部',
    pointer: '—',
    traveled: 0,
    inferMs: 0,
  }

  constructor(private readonly app: App) {
    this.gui = new GUI({ title: '调试面板（D 键隐藏）' })

    // ── 状态 ─────────────────────────────────────────────
    const fStatus = this.gui.addFolder('状态')
    fStatus.add(this.stats, 'fps').name('帧率').listen().disable()
    fStatus.add(this.stats, 'act').name('当前幕').listen().disable()
    fStatus.add(this.stats, 'input').name('输入源').listen().disable()
    fStatus.add(this.stats, 'traveled').name('累计移动').listen().disable()
    fStatus.add(this.stats, 'pointer').name('指针位置').listen().disable()
    fStatus.add(this.stats, 'inferMs').name('推理耗时(ms)').listen().disable()
    fStatus.close()

    // ── 输入 ─────────────────────────────────────────────
    const fInput = this.gui.addFolder('输入与滤波')
    fInput.add({ go: () => void this.app.toggleInput() }, 'go').name('切换 手部 / 鼠标')

    // 手感预设：一键切档，现场 A/B 对比手感（跟手/平衡/稳定）——不替用户猜，人测决定
    const presetCtrl = { preset: CONFIG.pointer.preset as string }
    fInput
      .add(presetCtrl, 'preset', ['跟手', '平衡', '稳定'])
      .name('手感预设')
      .onChange((name: string) => {
        const p = (CONFIG.pointer.presets as Record<string, { minCutoff: number; beta: number; dCutoff: number }>)[name]
        if (!p) return
        CONFIG.pointer.preset = name as '跟手' | '平衡' | '稳定'
        this.app.router.setFilterParams(p.minCutoff, p.beta, p.dCutoff)
      })

    // 精确调参（预设是粗调，这里是微调）
    fInput.add(CONFIG.pointer.presets['跟手'], 'minCutoff', 0.5, 4, 0.05).name('平滑（低=更稳）')
    fInput.add(CONFIG.pointer.presets['跟手'], 'beta', 0.001, 0.08, 0.001).name('跟手（高=更跟）')
    fInput
      .add(
        {
          apply: () => {
            const p = CONFIG.pointer.presets['跟手']
            this.app.router.setFilterParams(p.minCutoff, p.beta, p.dCutoff)
          },
        },
        'apply',
      )
      .name('应用滤波参数')

    fInput.add(CONFIG.pointer, 'inferWidth', [320, 480, 640, 960, 1280]).name('推理分辨率宽')
    fInput.add(CONFIG.pointer, 'inferHeight', [240, 360, 480, 720]).name('推理分辨率高')

    // ── 摄像头：笔记本常有多个设备（IR/虚拟摄像头），黑框时在这里手动换 ──
    const fCam = this.gui.addFolder('摄像头')
    const camCtl = { device: '' }
    void this.app
      .listCameras()
      .then((list) => {
        const options: Record<string, string> = { '（默认）': '' }
        for (const c of list) options[c.label] = c.id
        fCam
          .add(camCtl, 'device', options)
          .name('选择设备')
          .onChange((id: string) => {
            if (id) void this.app.switchCamera(id).catch((e) => console.error('[wisp-field] 切换摄像头失败：', e))
          })
      })
      .catch(() => {})

    // ── 麦浪 ─────────────────────────────────────────────
    const fWheat = this.gui.addFolder('麦浪')
    fWheat.add(CONFIG.wheat, 'windStrength', 0, 0.6, 0.01).name('风力')
    fWheat.add(CONFIG.wheat, 'windDirection', 0, Math.PI * 2, 0.02).name('风向（弧度）')
    fWheat.add(CONFIG.wheat, 'swayScale', 0, 1.5, 0.01).name('摆动幅度')
    fWheat.add(CONFIG.wheat, 'gustStrength', 0, 1, 0.01).name('阵风对比（0=均匀风）')
    fWheat.add(CONFIG.wheat, 'gustScale', 0.02, 0.3, 0.005).name('风斑大小（小=斑大）')
    fWheat.add(CONFIG.wheat, 'gustSpeed', 0, 8, 0.1).name('阵风推进速度')
    fWheat.add(CONFIG.wheat, 'handRadius', 0.5, 8, 0.1).name('手影响半径')
    fWheat.close()

    // ── 主角 ─────────────────────────────────────────────
    const fGirl = this.gui.addFolder('小满（主角）')
    fGirl.add(CONFIG.girl, 'scale', 0.8, 2.2, 0.01).name('整体大小')
    fGirl.add(CONFIG.girl, 'maxSpeed', 2, 8, 0.1).name('步速上限')
    fGirl.add(CONFIG.girl, 'stiffness', 6, 60, 1).name('步伐弹性')
    fGirl.add(CONFIG.girl, 'dampingRatio', 0.6, 1.2, 0.01).name('阻尼（<1 会过冲）')
    fGirl.add(CONFIG.girl, 'wanderAmp', 0, 6, 0.1).name('漫步范围')
    fGirl.add(CONFIG.girl, 'curiosityAmp', 0, 4, 0.05).name('好奇幅度')
    fGirl.add(CONFIG.girl, 'curiosityMin', 1, 12, 0.5).name('好奇间隔下限（秒）')
    fGirl.add(CONFIG.girl, 'curiosityMax', 1, 12, 0.5).name('好奇间隔上限（秒）')
    fGirl.add(CONFIG.girl, 'turnLerp', 2, 16, 0.5).name('转身利落度')
    fGirl.close()

    // ── 导演 ─────────────────────────────────────────────
    const fStory = this.gui.addFolder('三幕流程')
    fStory.add({ to: () => this.app.jumpTo(1) }, 'to').name('跳到 · 第一幕 静止')
    fStory.add({ to: () => this.app.jumpTo(2) }, 'to').name('跳到 · 第二幕 唤醒')
    fStory.add({ to: () => this.app.jumpTo(3) }, 'to').name('跳到 · 第三幕 共生')
    fStory.add({ go: () => this.app.resetStory() }, 'go').name('重置整个体验')
    fStory.add(CONFIG.story, 'act1Timeout', 5, 60, 1).name('一幕超时（防冷场）')
    fStory.add(CONFIG.flowers, 'attractRadius', 0.5, 6, 0.1).name('花朵苏醒半径')

    // ── 后期 ─────────────────────────────────────────────
    const fPost = this.gui.addFolder('后期')
    fPost.add(CONFIG.bloom, 'enabled').name('启用 Bloom')
    fPost.add(CONFIG.bloom, 'strength', 0, 1.5, 0.01).name('Bloom 强度')
    fPost.add(CONFIG.bloom, 'radius', 0, 1.2, 0.01).name('Bloom 半径')
    fPost.add(CONFIG.bloom, 'threshold', 0, 1, 0.01).name('Bloom 阈值')
    fPost.close()
  }

  updateStats(fps: number, pointer: PointerState): void {
    this.stats.fps = Math.round(fps)
    this.stats.act = this.app.director.act
    this.stats.input = this.app.router.activeKind === 'hand' ? '手部' : '鼠标'
    this.stats.traveled = Math.round(this.app.router.state.traveled * 10) / 10
    this.stats.pointer = pointer.active
      ? `${pointer.world.x.toFixed(1)}, ${pointer.world.z.toFixed(1)}`
      : '丢失'
    this.stats.inferMs = Math.round(this.app.lastInferMs)
  }

  toggleVisible(): void {
    const el = this.gui.domElement
    el.style.display = el.style.display === 'none' ? '' : 'none'
  }

  get domElement(): HTMLElement {
    return this.gui.domElement
  }
}
