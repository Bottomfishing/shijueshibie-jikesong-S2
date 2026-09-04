import type { PointerSource, RawPointer } from '../types'

/**
 * 鼠标 / 触摸兜底输入源。
 *
 * 两个用途：
 * 1. 开发期不用摄像头也能调麦浪、精灵、导演流程；
 * 2. 现场摄像头挂了（没权限、被占用、光线太差）时一键接管，演示不会开天窗。
 * 按住鼠标左键 = 捏合，对应 grab = 1。
 */
export class MousePointerSource implements PointerSource {
  readonly kind = 'mouse' as const
  ready = false

  private x = 0.5
  private y = 0.5
  private down = false
  private inside = false

  private readonly onMove = (e: PointerEvent) => {
    this.x = e.clientX / window.innerWidth
    this.y = e.clientY / window.innerHeight
    this.inside = true
  }
  private readonly onDown = () => {
    this.down = true
    this.inside = true
  }
  private readonly onUp = () => {
    this.down = false
  }
  private readonly onLeave = () => {
    this.inside = false
    this.down = false
  }

  init(): Promise<void> {
    window.addEventListener('pointermove', this.onMove, { passive: true })
    window.addEventListener('pointerdown', this.onDown, { passive: true })
    window.addEventListener('pointerup', this.onUp, { passive: true })
    window.addEventListener('pointercancel', this.onUp, { passive: true })
    window.addEventListener('pointerleave', this.onLeave, { passive: true })
    this.ready = true
    return Promise.resolve()
  }

  sample(_now: number): RawPointer {
    return {
      active: this.inside,
      x: this.x,
      y: this.y,
      grab: this.down ? 1 : 0,
      spread: this.down ? 0.2 : 0.6,
      fresh: true,
    }
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
    window.removeEventListener('pointerleave', this.onLeave)
    this.ready = false
  }
}
