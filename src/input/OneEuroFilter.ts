/**
 * One Euro Filter
 * https://gery.casiez.net/1euro/
 *
 * 为什么不用简单低通：
 * 简单低通要么抖（截止频率高），要么拖沓（截止频率低），二选一，怎么调都别扭。
 * One Euro 的核心是让截止频率随速度自适应——慢的时候强平滑滤掉抖动，
 * 快的时候放开带宽保证跟手。姿态/手部追踪的抖动基本靠它救回来。
 */

function alphaFor(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

class LowPass {
  private y = 0
  private initialized = false

  filter(x: number, a: number): number {
    if (!this.initialized) {
      this.y = x
      this.initialized = true
      return x
    }
    this.y = a * x + (1 - a) * this.y
    return this.y
  }

  reset(): void {
    this.initialized = false
    this.y = 0
  }
}

export class OneEuroFilter {
  private readonly xFilter = new LowPass()
  private readonly dxFilter = new LowPass()
  private last = 0
  private hasValue = false

  constructor(
    /** 最小截止频率：越小越平滑，但低速时越拖 */
    public minCutoff = 1.0,
    /** 速度系数：越大越跟手，抖动也回来得越多 */
    public beta = 0.01,
    /** 导数滤波截止频率，一般固定 1.0 即可 */
    public dCutoff = 1.0,
  ) {}

  filter(x: number, dt: number): number {
    if (!Number.isFinite(x)) return this.last
    if (dt <= 0) return this.last

    const dx = this.hasValue ? (x - this.last) / dt : 0
    const edx = this.dxFilter.filter(dx, alphaFor(this.dCutoff, dt))
    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    const y = this.xFilter.filter(x, alphaFor(cutoff, dt))

    this.last = y
    this.hasValue = true
    return y
  }

  reset(): void {
    this.xFilter.reset()
    this.dxFilter.reset()
    this.hasValue = false
    this.last = 0
  }
}

/** 二维版本，内部就是两个独立标量滤波器 */
export class OneEuroFilter2D {
  private readonly fx: OneEuroFilter
  private readonly fy: OneEuroFilter

  constructor(minCutoff = 1.0, beta = 0.01, dCutoff = 1.0) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff)
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff)
  }

  filter(x: number, y: number, dt: number): [number, number] {
    return [this.fx.filter(x, dt), this.fy.filter(y, dt)]
  }

  setParams(minCutoff: number, beta: number, dCutoff: number): void {
    this.fx.minCutoff = minCutoff
    this.fy.minCutoff = minCutoff
    this.fx.beta = beta
    this.fy.beta = beta
    this.fx.dCutoff = dCutoff
    this.fy.dCutoff = dCutoff
  }

  reset(): void {
    this.fx.reset()
    this.fy.reset()
  }
}
