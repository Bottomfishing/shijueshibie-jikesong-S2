/**
 * 场景内提示：底部胶囊，主文案 + 可选操作副文案，淡入停留淡出。
 *
 * 玩家要求"告诉用户怎么做"——所以提示必须是可执行的动作指令，
 * 并且按当前输入方式（手部/鼠标）给出对应的操作说法。
 */
export class HintLayer {
  private readonly el: HTMLElement
  private readonly mainEl: HTMLElement
  private readonly subEl: HTMLElement
  private hideTimer = 0

  constructor() {
    let el = document.getElementById('hint')
    if (!el) {
      el = document.createElement('div')
      el.id = 'hint'
      document.body.appendChild(el)
    }
    el.innerHTML = ''
    const main = document.createElement('div')
    main.className = 'hint-main'
    const sub = document.createElement('div')
    sub.className = 'hint-sub'
    el.appendChild(main)
    el.appendChild(sub)
    this.el = el
    this.mainEl = main
    this.subEl = sub
  }

  show(main: string, sub?: string, holdMs = 6500): void {
    this.mainEl.textContent = main
    if (sub) {
      this.subEl.textContent = sub
      this.subEl.style.display = ''
    } else {
      this.subEl.style.display = 'none'
    }
    this.el.classList.add('visible')
    window.clearTimeout(this.hideTimer)
    this.hideTimer = window.setTimeout(() => this.el.classList.remove('visible'), holdMs)
  }

  hide(): void {
    window.clearTimeout(this.hideTimer)
    this.el.classList.remove('visible')
  }
}
