import type * as THREE from 'three'

/** 输入源每帧产出的原始数据（归一化屏幕空间） */
export interface RawPointer {
  /** 是否检测到有效输入（手在画面内 / 鼠标在窗口内） */
  active: boolean
  /** 归一化横坐标 0..1，已按镜像修正（手往右＝x 变大） */
  x: number
  /** 归一化纵坐标 0..1，屏幕向下为正 */
  y: number
  /** 捏合程度 0..1（拇指与食指靠近为 1） */
  grab: number
  /** 手掌张开程度 0..1 */
  spread: number
  /**
   * 这一帧是否来自新的观测。
   * 鼠标是事件驱动（每次移动都是新值，always true）；
   * 手部受摄像头帧率限制（常见 30fps），显卡不出新帧时返回的是缓存旧值（false）。
   * 路由器据此在"无新观测的渲染帧"里做运动外推插值，把 30Hz 跳变补成连续轨迹。
   */
  fresh: boolean
}

/** 经过滤波、投影到世界空间后的指针状态，供场景与导演消费 */
export interface PointerState {
  active: boolean
  /** 原始屏幕坐标（未滤波） */
  screen: THREE.Vector2
  /** 交互平面上的世界坐标 */
  world: THREE.Vector3
  /** 世界坐标速度（单位/秒） */
  velocity: THREE.Vector3
  /** 速度大小 */
  speed: number
  /** 平滑后的运动能量 0..1，驱动麦浪与导演判断 */
  energy: number
  grab: number
  spread: number
  /** 持续丢失输入的时长（秒） */
  lostFor: number
  /** 累计移动距离（世界单位），导演用它判断玩家是否"玩起来了" */
  traveled: number
}

/**
 * 输入源抽象。
 *
 * 为什么要这层：现场摄像头可能没权限、光线太差、被别的程序占用。
 * 有这层抽象，手部失败时能在 0 成本下切到鼠标，演示不会开天窗。
 */
export interface PointerSource {
  readonly kind: 'hand' | 'mouse'
  readonly ready: boolean
  init(): Promise<void>
  sample(now: number): RawPointer
  dispose(): void
}

/**
 * 导演层输出的世界意图，供世界层消费。
 *
 * 流程条件判断集中在 StoryDirector，世界对象只负责表现和局部运动。
 * 这样三人协作时：A 改流程不动世界，B 改视觉不动流程，职责清晰。
 */
export interface WorldIntent {
  /** 当前阶段 */
  phase: 'dormant' | 'awakening' | 'bonded' | 'journey' | 'windRise' | 'finale'
  /** 色调冷暖 0..1（0=冷灰，1=暖金） */
  warmth: number
  /** 风力倍率（基准值在 CONFIG.wheat.windStrength） */
  windStrength: number
  /** 交互响应增益 0..1（手部对麦浪的影响倍率） */
  interactionGain: number
  /** 镜头模式 */
  cameraMode: 'overview' | 'follow' | 'sea'
  /** 北方麦海开放度 0..1（0=完全封闭，1=完全打开） */
  northOpen: number
  /** 最终演出进度 0..1 */
  finaleProgress: number
}
