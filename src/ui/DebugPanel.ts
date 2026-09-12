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
  /** 面板隐藏时跳过 updateStats 的每帧字符串拼接与赋值（lil-gui 的 listen 依然活着，但那是它的固有开销） */
  private panelVisible = true

  private readonly stats = {
    fps: 0,
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

    // 推理分辨率：改完自动重开摄像头生效（防抖合并宽/高连续两次修改，只重开一次）
    const applySize = (() => {
      let timer = 0
      return () => {
        window.clearTimeout(timer)
        timer = window.setTimeout(() => {
          void this.app.applyInferSize().catch((e) => console.error('[wisp-field] 应用推理分辨率失败：', e))
        }, 400)
      }
    })()
    fInput.add(CONFIG.pointer, 'inferWidth', [320, 480, 640, 960, 1280]).name('推理分辨率宽').onChange(applySize)
    fInput.add(CONFIG.pointer, 'inferHeight', [240, 360, 480, 720]).name('推理分辨率高').onChange(applySize)

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

    // ── 主角 ─────────────────────────────────────────────
    const fGirl = this.gui.addFolder('小满（主角）')
    // scale 不再每帧回灌：拧动时才应用到角色（App.loop 里对应的每帧调用已移除）
    fGirl.add(CONFIG.girl, 'scale', 0.8, 2.2, 0.01).name('整体大小').onChange((v: number) => this.app.setGirlScale(v))
    fGirl.add(CONFIG.girl, 'maxSpeed', 2, 8, 0.1).name('步速上限')
    fGirl.add(CONFIG.girl, 'stiffness', 6, 60, 1).name('步伐弹性')
    fGirl.add(CONFIG.girl, 'dampingRatio', 0.6, 1.2, 0.01).name('阻尼（<1 会过冲）')
    fGirl.add(CONFIG.girl, 'wanderAmp', 0, 6, 0.1).name('漫步范围')
    fGirl.add(CONFIG.girl, 'curiosityAmp', 0, 4, 0.05).name('好奇幅度')
    fGirl.add(CONFIG.girl, 'turnLerp', 2, 16, 0.5).name('转身利落度')
    fGirl.close()

    this.gui.add({ reset: () => this.app.resetCharacter() }, 'reset').name('重置小满位置')
  }

  updateStats(fps: number, pointer: PointerState): void {
    if (!this.panelVisible) return
    this.stats.fps = Math.round(fps)
    this.stats.input = this.app.router.activeKind === 'hand' ? '手部' : '鼠标'
    this.stats.traveled = Math.round(this.app.router.state.traveled * 10) / 10
    this.stats.pointer = pointer.active
      ? `${pointer.world.x.toFixed(1)}, ${pointer.world.z.toFixed(1)}`
      : '丢失'
    this.stats.inferMs = Math.round(this.app.lastInferMs)
  }

  toggleVisible(): void {
    this.panelVisible = !this.panelVisible
    this.gui.domElement.style.display = this.panelVisible ? '' : 'none'
  }

  get domElement(): HTMLElement {
    return this.gui.domElement
  }
}
