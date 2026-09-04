/**
 * 左下角常驻操作表：当前世界里"能做什么"一览。
 *
 * 默认收成一个左下角的小圆徽标（零 UI 理念：不抢戏、不挡镜头），
 * 点徽标或按 H 展开完整手势表；再次点/按收起。
 * 手势语义用通用品类描述，鼠标键位单独附在底部小字里。
 */
export class OpsPanel {
  private readonly el: HTMLElement
  private readonly badge: HTMLElement
  private expanded = false

  constructor() {
    let el = document.getElementById('ops')
    if (!el) {
      el = document.createElement('div')
      el.id = 'ops'
      document.body.appendChild(el)
    }
    // 完整手势表（默认隐藏，by collapsed 徽标控制）
    el.innerHTML = `
      <div class="ops-card">
        <div class="ops-title">手 势</div>
        <div class="ops-row"><b>移动手掌</b> —— 指引小满</div>
        <div class="ops-row"><b>快速挥动</b> —— 拨动麦浪</div>
        <div class="ops-row"><b>张开手掌</b> —— 起风</div>
        <div class="ops-row"><b>捏合手指</b> —— 摘花</div>
        <div class="ops-mouse">鼠标模式：移动 = 手掌 · 按住左键 = 捏合<br>快速划动 = 起风</div>
      </div>
      <button class="ops-badge" title="展开 / 收起手势说明（H）" aria-label="展开手势说明">
        <span class="ops-badge-dot"></span>
        <span class="ops-badge-text">手势</span>
      </button>
    `
    this.el = el

    this.badge = el.querySelector('.ops-badge')!
    // 徽标点击：展开 <-> 收起
    this.badge.addEventListener('click', (e) => {
      e.stopPropagation()
      this.toggle()
    })
    // 容器点击（指到卡片空白处也可收起）
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el || e.target === this.badge) return
      this.collapse()
    })

    this.apply()
  }

  /** 展开卡片并确保徽标仍可见（供 H 键始终可用） */
  private apply(): void {
    this.el.classList.toggle('expanded', this.expanded)
    this.badge.setAttribute('aria-expanded', String(this.expanded))
  }

  setVisible(v: boolean): void {
    // 常驻面板仍有意义（用户要求扫一眼知道能力），保留 hidden 语义但不强制折叠
    if (!v) this.collapse()
  }

  expand(): void {
    this.expanded = true
    this.apply()
  }

  collapse(): void {
    this.expanded = false
    this.apply()
  }

  toggle(): void {
    this.expanded = !this.expanded
    this.apply()
  }
}
