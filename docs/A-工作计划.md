# A（交互与流程负责人）工作计划

## 当前状态（2026-09-11）

### 已有基础
- ✅ 输入层完整实现（HandPointerSource, MousePointerSource, PointerRouter）
- ✅ 类型定义完善（RawPointer, PointerState, PointerSource）
- ✅ 滤波系统（OneEuroFilter）
- ✅ 三幕导演系统（StoryDirector）

### 与合作文档的差异
- ⚠️ 当前是 3 幕系统，文档要求 6 阶段 6 分钟流程
- ⚠️ 缺少 WorldIntent 接口定义
- ⚠️ 导演判断条件不完整（缺少位置触发、风力充能等）

---

## 任务优先级

### 🔴 P0：接口对齐（必须先做，避免后续返工）

#### 1. 定义 WorldIntent 接口
在 `src/types.ts` 中添加：
```typescript
export interface WorldIntent {
  phase: 'dormant' | 'awakening' | 'bonded' | 'journey' | 'finale'
  warmth: number          // 0..1 色调冷暖
  windStrength: number    // 风力倍率
  interactionGain: number // 交互响应增益
  cameraMode: 'overview' | 'follow' | 'sea'
  northOpen: number       // 0..1 北方麦海开放度
  finaleProgress: number  // 0..1 最终演出进度
}
```

#### 2. 扩展 StoryDirector 从 3 幕到 6 阶段
修改 `src/director/StoryDirector.ts`：
- 增加阶段定义：`'dormant' | 'awakening' | 'bonded' | 'journey' | 'windRise' | 'finale'`
- 增加阶段切换条件
- 增加超时兜底机制
- 输出 WorldIntent 而不是直接输出世界参数

#### 3. 创建配置拆分
从 `src/config.ts` 拆分出：
- `src/config/input.config.ts` - 输入相关参数
- `src/config/story.config.ts` - 流程阶段参数

---

### 🟡 P1：核心流程实现

#### 4. 实现 6 阶段状态机
按合作文档表格实现：
```
0:00-0:40  静止      → 检测移动或超时
0:40-1:40  唤醒      → 累计移动达阈值
1:40-3:00  建立关系  → 3朵花采集完成
3:00-4:20  向北探索  → 到达北方触发区
4:20-5:30  起风与海  → 风力充能完成
5:30-6:00  最终高潮  → 演出完成
```

#### 5. 增加位置追踪
在 PointerState 或新增状态中追踪：
- 玩家当前位置（北方进度）
- 区域触发判断

#### 6. 增加风力充能机制
追踪"张开手掌持续时间"累计风力能量

---

### 🟢 P2：异常处理与兜底

#### 7. 每个阶段的超时机制
确保不会因为玩家不动作而永久卡住

#### 8. 输入丢失优雅降级
- 手部丢失时的平滑处理（已有基础，检查是否完善）
- 摄像头切换鼠标的无缝体验

#### 9. 重置功能
确保 R 键能完整重置 6 分钟体验

---

## 与 B、C 的协作接口

### 输出给 B（世界负责人）
- ✅ `PointerState` - 已定义，B 用它驱动麦田、精灵反馈
- 🔲 `WorldIntent` - **需要定义**，B 用它控制世界状态

### 输出给 C（演出负责人）
- 🔲 阶段切换事件 - C 用它触发镜头转场、音效
- 🔲 当前阶段信息 - C 用它判断何时显示提示

### 从 B 接收
- 🔲 `flowersRemaining` - 花朵剩余数量（用于判断阶段2→3）
- 🔲 玩家位置 - 精灵/角色的世界坐标（用于判断阶段3→4）

---

## 下一步行动

### 立即开始（今天）
1. ✅ 创建 feat/input 分支（已完成）
2. 🔲 与 B、C 讨论并最终确定接口（WorldIntent）
3. 🔲 在 `src/types.ts` 添加 WorldIntent 接口
4. 🔲 创建 `src/config/story.config.ts` 定义 6 阶段参数

### 明天
5. 🔲 重构 StoryDirector 支持 6 阶段
6. 🔲 实现阶段切换逻辑和超时兜底
7. 🔲 提交第一个 PR：接口定义 + 配置拆分

---

## 注意事项

- ⚠️ 不要单独重构 App.ts、config.ts，这些文件三人都会改，容易冲突
- ⚠️ 接口变更必须在群里通知 B 和 C
- ⚠️ 每个 PR 必须通过 `npm run typecheck` 和 `npm run build`
- ⚠️ 手动验证鼠标模式和摄像头模式各一次

---

最后更新：2026-09-11 23:00
