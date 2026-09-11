import type { PointerState, WorldIntent } from '../types'
import type { GirlState } from '../world/Girl'
import { STAGE_TIMING, STAGE_CONDITIONS, STAGE_PROFILES } from '../config/story.config'

/**
 * 6 阶段定义
 *
 * 按照合作开发文档设计的 6 分钟体验流程：
 * - dormant (静止的世界): 0:00-0:40，玩家试探性移动
 * - awakening (唤醒): 0:40-1:40，挥手让麦浪分开
 * - bonded (建立关系): 1:40-3:00，采集 3 朵花
 * - journey (向北探索): 3:00-4:20，带精灵向北移动
 * - windRise (起风与海): 4:20-5:30，张开手掌持续起风
 * - finale (最终高潮): 5:30-6:00，海边演出
 */
export type Stage = 'dormant' | 'awakening' | 'bonded' | 'journey' | 'windRise' | 'finale'

/**
 * 故事导演：6 阶段状态机
 *
 * 职责：
 * - 跟踪当前阶段和阶段时长
 * - 根据玩家行为（移动、采集、位置、手势）判断阶段完成条件
 * - 输出 WorldIntent 供世界层消费
 * - 每个阶段有超时兜底，防止玩家不动作永久卡住
 *
 * 不做的事：
 * - 不直接操作世界对象（麦田、精灵等）
 * - 不管理镜头（由 C 的 CameraDirector 负责）
 * - 不处理音效（由 C 的 AudioDirector 负责）
 */
export class StoryDirector {
  /** 当前阶段 */
  stage: Stage = 'dormant'

  /** 当前阶段已持续时长（秒） */
  stageTime = 0

  /** 总游玩时长（秒） */
  totalTime = 0

  /** 当前输出的世界意图 */
  readonly intent: WorldIntent = {
    phase: 'dormant',
    warmth: 0.06,
    windStrength: 0.55,
    interactionGain: 0.6,
    cameraMode: 'overview',
    northOpen: 0,
    finaleProgress: 0,
  }

  // ── 阶段完成条件追踪 ──
  private travelAtStageStart = 0  // 进入当前阶段时的累计移动距离
  private windEnergy = 0           // 风力充能累计（秒）

  /**
   * 每帧更新
   *
   * @param dt 帧间隔（秒）
   * @param pointer 输入状态
   * @param flowersRemaining 剩余花朵数量（由世界层提供）
   * @param girlPositionZ 精灵当前 Z 坐标（由世界层提供）
   * @returns 如果切换到新阶段，返回新阶段名；否则返回 null
   */
  update(
    dt: number,
    pointer: PointerState,
    flowersRemaining: number,
    girlPositionZ: number,
  ): Stage | null {
    this.stageTime += dt
    this.totalTime += dt

    const prevStage = this.stage

    // 判断是否满足进入下一阶段的条件
    this.checkStageTransition(pointer, flowersRemaining, girlPositionZ)

    // 如果阶段切换了
    if (this.stage !== prevStage) {
      this.onStageEnter(pointer)
      return this.stage
    }

    // 更新风力充能（只在 windRise 阶段累计）
    if (this.stage === 'windRise') {
      if (pointer.active && pointer.spread > STAGE_CONDITIONS.windRise.spreadThreshold) {
        this.windEnergy += dt
      }
    }

    // 平滑过渡世界参数
    this.updateWorldIntent(dt)

    return null
  }

  /**
   * 检查阶段切换条件
   */
  private checkStageTransition(
    pointer: PointerState,
    flowersRemaining: number,
    girlPositionZ: number,
  ): void {
    const timing = STAGE_TIMING[this.stage]
    const conditions = STAGE_CONDITIONS[this.stage]

    // 超时兜底：超过最大时长自动进入下一阶段
    if (this.stageTime > timing.timeout) {
      this.advanceStage()
      return
    }

    // 未达到最小时长，不允许切换（防止误触秒过）
    if (this.stageTime < timing.minTime) {
      return
    }

    // 各阶段的完成条件
    switch (this.stage) {
      case 'dormant': {
        // 累计移动距离达到阈值
        const traveled = pointer.traveled - this.travelAtStageStart
        if (traveled >= conditions.travelRequired) {
          this.advanceStage()
        }
        break
      }

      case 'awakening': {
        // 累计移动距离达到更高阈值
        const traveled = pointer.traveled - this.travelAtStageStart
        if (traveled >= conditions.travelRequired) {
          this.advanceStage()
        }
        break
      }

      case 'bonded': {
        // 采集完所有花朵
        if (flowersRemaining <= 0) {
          this.advanceStage()
        }
        break
      }

      case 'journey': {
        // 精灵到达北方位置
        if (girlPositionZ <= conditions.northPositionZ) {
          this.advanceStage()
        }
        break
      }

      case 'windRise': {
        // 风力充能完成
        if (this.windEnergy >= conditions.windEnergyRequired) {
          this.advanceStage()
        }
        break
      }

      case 'finale': {
        // 最终演出阶段，由演出系统控制结束
        // 这里只处理超时兜底
        break
      }
    }
  }

  /**
   * 进入下一阶段
   */
  private advanceStage(): void {
    const stageOrder: Stage[] = ['dormant', 'awakening', 'bonded', 'journey', 'windRise', 'finale']
    const currentIndex = stageOrder.indexOf(this.stage)

    if (currentIndex < stageOrder.length - 1) {
      this.stage = stageOrder[currentIndex + 1]
    }
  }

  /**
   * 阶段进入时的初始化
   */
  private onStageEnter(pointer: PointerState): void {
    this.stageTime = 0

    // 记录进入阶段时的状态
    if (this.stage === 'dormant' || this.stage === 'awakening') {
      this.travelAtStageStart = pointer.traveled
    }

    if (this.stage === 'windRise') {
      this.windEnergy = 0
    }

    console.log(`[StoryDirector] 进入阶段: ${this.stage}`)
  }

  /**
   * 平滑过渡世界参数到目标值
   */
  private updateWorldIntent(dt: number): void {
    const profile = STAGE_PROFILES[this.stage]

    // 所有参数都做时间平滑，避免跳变
    const lerpSpeed = 0.8 // 平滑速度

    this.intent.phase = this.stage
    this.intent.warmth += (profile.warmth - this.intent.warmth) * Math.min(1, dt * lerpSpeed)
    this.intent.windStrength += (profile.windStrength - this.intent.windStrength) * Math.min(1, dt * lerpSpeed)
    this.intent.interactionGain += (profile.interactionGain - this.intent.interactionGain) * Math.min(1, dt * lerpSpeed)
    this.intent.cameraMode = profile.cameraMode
    this.intent.northOpen += (profile.northOpen - this.intent.northOpen) * Math.min(1, dt * lerpSpeed * 0.6)

    // finale 阶段的进度（0..1）
    if (this.stage === 'finale') {
      const timing = STAGE_TIMING.finale
      this.intent.finaleProgress = Math.min(1, this.stageTime / timing.targetTime)
    } else {
      this.intent.finaleProgress = 0
    }
  }

  /**
   * 调试用：直接跳到指定阶段
   */
  jumpTo(stage: Stage, pointer: PointerState): void {
    this.stage = stage
    this.onStageEnter(pointer)

    // 立即同步世界参数（不做平滑）
    const profile = STAGE_PROFILES[stage]
    this.intent.phase = stage
    this.intent.warmth = profile.warmth
    this.intent.windStrength = profile.windStrength
    this.intent.interactionGain = profile.interactionGain
    this.intent.cameraMode = profile.cameraMode
    this.intent.northOpen = profile.northOpen
    this.intent.finaleProgress = 0
  }

  /**
   * 重置到初始状态
   */
  reset(pointer: PointerState): void {
    this.jumpTo('dormant', pointer)
    this.totalTime = 0
    this.travelAtStageStart = pointer.traveled
    this.windEnergy = 0
  }
}
