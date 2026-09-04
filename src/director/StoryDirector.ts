import { CONFIG } from '../config'
import type { PointerState } from '../types'
import type { GirlState } from '../world/Girl'

export type Act = 1 | 2 | 3

interface ActProfile {
  warmth: number
  gain: number
  /** 风力的倍率，基准值在 CONFIG.wheat.windStrength，这样调试面板调基准时三幕同步生效 */
  windScale: number
  girlIntensity: number
  girlState: GirlState
  motesVisible: boolean
}

/**
 * 每一幕的世界参数。
 *
 * 三幕不是三个关卡，是同一片麦田的三种状态：睡着 → 半醒 → 认得你了。
 * 切换靠的是玩家自己的动作，不是计时器（超时只是防冷场的兜底）。
 */
const PROFILES: Record<Act, ActProfile> = {
  // 睡着：冷灰、风很小。但手部响应不能弱——第一次挥手就要看到麦子分开，不然用户以为坏了
  1: { warmth: 0.06, gain: 0.6, windScale: 0.55, girlIntensity: 0.4, girlState: 'dormant', motesVisible: false },
  // 半醒：暖意回来一点，光点浮出来，小满开始好奇地试探你的手
  2: { warmth: 0.52, gain: 0.78, windScale: 1.0, girlIntensity: 0.7, girlState: 'waking', motesVisible: true },
  // 认得你了：全暖金，麦浪完全听你的，小满走到哪麦子让到哪
  3: { warmth: 1.0, gain: 1.0, windScale: 1.35, girlIntensity: 1.0, girlState: 'bonded', motesVisible: true },
}

export class StoryDirector {
  act: Act = 1
  actTime = 0
  /** 0 = 教学场（三幕），1 = 第一章"石碑低语" */
  chapter: 0 | 1 = 0

  warmth = PROFILES[1].warmth
  gain = PROFILES[1].gain
  windScale = PROFILES[1].windScale
  girlIntensity = PROFILES[1].girlIntensity
  girlState: GirlState = PROFILES[1].girlState
  motesVisible = false

  /**
   * @returns 切换到新幕时返回幕号，否则 null。第一章由 App 在小满抵达月门时调用 enterChapter1()
   */
  update(dt: number, pointer: PointerState, flowersRemaining: number): Act | null {
    this.actTime += dt
    const st = CONFIG.story
    let next: Act | null = null

    if (this.act === 1) {
      const engaged = this.actTime > st.act1MinTime && pointer.traveled > st.act1Travel
      if (engaged || this.actTime > st.act1Timeout) next = 2
    } else if (this.act === 2) {
      if (flowersRemaining <= 0) next = 3
    }

    if (next !== null) {
      this.act = next
      this.actTime = 0
    }

    // 幕间过渡全部走时间平滑，绝不允许参数跳变——跳变一眼就是半成品
    const p = PROFILES[this.act]
    this.warmth += (p.warmth - this.warmth) * Math.min(1, dt * 0.65)
    this.gain += (p.gain - this.gain) * Math.min(1, dt * 1.6)
    this.windScale += (p.windScale - this.windScale) * Math.min(1, dt * 0.8)
    this.girlIntensity += (p.girlIntensity - this.girlIntensity) * Math.min(1, dt * 0.9)
    this.girlState = p.girlState
    this.motesVisible = p.motesVisible

    return next
  }

  /** 第一章"石碑低语"：小满抵达月门时由 App 调用 */
  enterChapter1(): void {
    this.chapter = 1
  }

  /** 调试用：直接跳幕（章节也回到教学场） */
  jumpTo(act: Act): void {
    this.act = act
    this.actTime = 0
    this.chapter = 0
    const p = PROFILES[act]
    this.warmth = p.warmth
    this.gain = p.gain
    this.windScale = p.windScale
    this.girlIntensity = p.girlIntensity
    this.girlState = p.girlState
    this.motesVisible = p.motesVisible
  }

  reset(): void {
    this.jumpTo(1)
  }
}
