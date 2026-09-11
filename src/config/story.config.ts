/**
 * 故事流程配置：6 分钟 6 阶段体验
 *
 * 按合作开发文档设计，每个阶段有：
 * - 最小时长（防止玩家误触秒过）
 * - 超时兜底（防止玩家不动作永久卡住）
 * - 完成条件（玩家主动达成）
 */

export interface StageConfig {
  /** 阶段名称 */
  name: string
  /** 最小停留时长（秒），防止误触秒过 */
  minTime: number
  /** 超时兜底（秒），超过此时间自动进入下一阶段 */
  timeout: number
  /** 目标时长（秒），用于进度条显示 */
  targetTime: number
}

/**
 * 6 阶段时间配置
 */
export const STAGE_TIMING: Record<string, StageConfig> = {
  // 0:00 - 0:40  静止的世界
  dormant: {
    name: '静止的世界',
    minTime: 5,      // 至少5秒，让玩家感受冷寂
    timeout: 50,     // 50秒还不动就自动进入（比目标40秒多留10秒容错）
    targetTime: 40,
  },

  // 0:40 - 1:40  唤醒
  awakening: {
    name: '唤醒',
    minTime: 10,     // 至少10秒
    timeout: 80,     // 80秒超时
    targetTime: 60,
  },

  // 1:40 - 3:00  建立关系（采集3朵花）
  bonded: {
    name: '建立关系',
    minTime: 20,     // 至少20秒
    timeout: 120,    // 2分钟超时
    targetTime: 80,
  },

  // 3:00 - 4:20  向北探索
  journey: {
    name: '向北探索',
    minTime: 20,
    timeout: 100,
    targetTime: 80,
  },

  // 4:20 - 5:30  起风与海
  windRise: {
    name: '起风与海',
    minTime: 15,
    timeout: 90,
    targetTime: 70,
  },

  // 5:30 - 6:00  最终高潮
  finale: {
    name: '最终高潮',
    minTime: 10,
    timeout: 60,
    targetTime: 30,
  },
}

/**
 * 阶段完成条件配置
 */
export const STAGE_CONDITIONS = {
  // 第一阶段：累计移动距离（世界单位）
  dormant: {
    travelRequired: 8,  // 累计移动8个世界单位
  },

  // 第二阶段：累计移动距离（更多）
  awakening: {
    travelRequired: 25, // 累计移动25个世界单位
  },

  // 第三阶段：采集花朵数量
  bonded: {
    flowersRequired: 3, // 采集3朵花
  },

  // 第四阶段：到达北方位置（世界坐标 z 值）
  journey: {
    northPositionZ: -15, // 精灵到达 z < -15 的位置
  },

  // 第五阶段：风力充能
  windRise: {
    windEnergyRequired: 100, // 累计张开手掌时间（秒）
    spreadThreshold: 0.6,    // spread > 0.6 才算张开
  },

  // 第六阶段：演出完成（由演出系统控制）
  finale: {
    // 这个阶段主要是演出，完成后显示重玩入口或自动重置
  },
}

/**
 * 每个阶段的世界参数配置
 */
export interface StageProfile {
  warmth: number           // 0..1 色调冷暖
  windStrength: number     // 风力倍率
  interactionGain: number  // 交互响应增益
  cameraMode: 'overview' | 'follow' | 'sea'
  northOpen: number        // 0..1 北方麦海开放度
}

export const STAGE_PROFILES: Record<string, StageProfile> = {
  dormant: {
    warmth: 0.06,
    windStrength: 0.55,
    interactionGain: 0.6,
    cameraMode: 'overview',
    northOpen: 0,
  },

  awakening: {
    warmth: 0.3,
    windStrength: 0.8,
    interactionGain: 0.75,
    cameraMode: 'overview',
    northOpen: 0,
  },

  bonded: {
    warmth: 0.52,
    windStrength: 1.0,
    interactionGain: 0.78,
    cameraMode: 'follow',
    northOpen: 0.3,
  },

  journey: {
    warmth: 0.7,
    windStrength: 1.15,
    interactionGain: 0.85,
    cameraMode: 'follow',
    northOpen: 0.7,
  },

  windRise: {
    warmth: 0.85,
    windStrength: 1.35,
    interactionGain: 0.95,
    cameraMode: 'sea',
    northOpen: 1.0,
  },

  finale: {
    warmth: 1.0,
    windStrength: 1.5,
    interactionGain: 1.0,
    cameraMode: 'sea',
    northOpen: 1.0,
  },
}
