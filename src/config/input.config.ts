/**
 * 输入层配置：滤波、坐标映射、输入源参数
 *
 * 从 config.ts 拆分出来，减少多人修改同一文件造成的冲突。
 */

/**
 * One Euro Filter 手感预设
 */
export interface FilterPreset {
  /** 慢速时的截止频率（越高越跟手，但静止时抖动越明显） */
  minCutoff: number
  /** 速度增益（越高快速挥动越跟手） */
  beta: number
  /** 速度滤波截止频率 */
  dCutoff: number
}

export const FILTER_PRESETS: Record<string, FilterPreset> = {
  稳定: {
    minCutoff: 1.2,
    beta: 0.3,
    dCutoff: 1.0,
  },
  平衡: {
    minCutoff: 2.0,
    beta: 0.7,
    dCutoff: 1.0,
  },
  跟手: {
    minCutoff: 2.5,
    beta: 1.2,
    dCutoff: 1.0,
  },
}

/**
 * 输入配置
 */
export const INPUT_CONFIG = {
  /** 当前使用的滤波预设 */
  preset: '平衡' as keyof typeof FILTER_PRESETS,

  /** 滤波预设字典 */
  presets: FILTER_PRESETS,

  /** 交互平面高度（世界坐标 y 值） */
  planeY: 1.1,

  /** 是否启用外推（30Hz 摄像头补帧到 60Hz） */
  extrapolate: true,

  /** 外推最大时间（毫秒），超过此时间不再外推 */
  extrapolateMaxMs: 100,

  /** 输入丢失判定时长（秒） */
  lostTimeout: 0.5,

  /** 摄像头配置 */
  camera: {
    /** 首选分辨率 */
    preferredWidth: 1280,
    preferredHeight: 720,

    /** 降级分辨率（黑帧修复时使用） */
    fallbackWidth: 640,
    fallbackHeight: 480,

    /** 黑帧检测阈值（平均亮度低于此值判定为黑帧） */
    blackThreshold: 10,

    /** 黑帧观察期（秒），连续黑帧超过此时间触发修复 */
    blackWatchDog: 10,
  },

  /** MediaPipe Hand Landmarker 配置 */
  mediapipe: {
    /** 检测置信度阈值 */
    minDetectionConfidence: 0.5,

    /** 追踪置信度阈值 */
    minTrackingConfidence: 0.5,

    /** 最多检测手数 */
    numHands: 1,
  },

  /** 手势识别阈值 */
  gesture: {
    /** 捏合判定：拇指与食指距离阈值（归一化） */
    grabThreshold: 0.08,

    /** 张开判定：手掌展开度阈值 */
    spreadThreshold: 0.6,
  },
}
