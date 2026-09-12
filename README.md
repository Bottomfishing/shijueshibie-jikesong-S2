# 奶蛙：遗忘档案馆

> 吉客松 S2 参赛作品 · 主题赛道「没有对话框的产品」
>
> 一只奶蛙被吸进废弃的网络记忆档案馆。站在摄像头前抬起手，掌光就是唯一的操作语言。

`Godot 4.7` · `GDScript` · `Vite + TypeScript` · `Three.js` · `MediaPipe Hand Landmarker` · `Electron`

---

## 这是什么

一个用**视觉识别驱动**的叙事小游戏。玩家不是点按钮读台词，而是用手掌的位置与开合，在世界里推、拉、抓、挡。

整个体验由四段构成：

| 段落 | 玩家在做什么 | 世界怎么回应 |
|---|---|---|
| **一 · 开场** | 在暗房里抬起手 | 奶蛙睁眼看你、请你按电源键、拍醒卡住的机器 |
| **二 · 档案走廊** | 在霓虹走廊里走动、靠近档案柜 | 三名档案员 NPC 接待你，对话后打开记忆传送门 |
| **三 · 记忆场景** | 走进 2016 / 2020 / 2024 三段记忆 | 每个年代有独立场景与互动 |
| **四 · 结尾** | 集齐三段记忆后做出选择 | 出口开启，三种结局 |

走廊里还散布着**三台可玩街机**（贪吃蛇 / 俄罗斯方块 / 打砖块），随时可以停下来打一局。

---

## 体验流程

### 一 · 开场：世界里的开机仪式

没有登录界面。开机是世界里一个物理动作，玩家按下的是画面上那台 CRT 的电源键。

演出由十拍状态机推进：

```
idle   暗房待机，只有呼吸和极慢的镜头漂移
seen   奶蛙睁眼，看向你的手
invite 电源键呼吸，奶蛙视线在你和按键之间来回
boot   CRT 自检，进度条故意卡在 99%，奶蛙拍一下机箱
mitosis 奶蛙从自己身上「啵」地弹出一只妈妈，两只用无字乱语交谈几句
pull   信号把展厅里的一切吸向中心
tunnel 时空隧道，方向由手掌位置控制
arrival 传送门
land   落在档案馆地面，镜头拉宽
done   交给玩家
```

引导全靠非语言线索：掌光位置、奶蛙的视线、按键的呼吸节奏。玩家不需要读任何提示就知道该伸手。

### 二 · 档案走廊

霓虹赛博朋克风格的网络记忆档案馆，四盏带阴影的冷暖吊灯、故障屏幕补光、整墙霓虹海报。

三个档案柜各有年代标牌、索引卡、发光把手、磨损材质和散落档案，**柜前各站着一名档案员 NPC**。柜位之间的空白走廊段摆着三台街机，靠近按 `E` 进入，`ESC` 退出，游玩期间角色移动被冻结。

### 三 · 记忆场景

与档案员对话结束后，对应的柜子会打开一道记忆传送门。穿过时间隧道抵达记忆空间：

| 记忆 ID | 场景名 | 年代主题 |
|---|---|---|
| `seen_2016` | 2016 / 霓虹夜市回声 | 看见 |
| `imitated_2020` | 2020 / 深夜街镇信号 | 模仿 |
| `covered_2024` | 2024 / 数据公园遗迹 | 覆盖 |

在记忆空间里走到交互点按 `E` 读取记忆，走到返回点按 `E` 回到档案长廊。

### 四 · 结尾：三种选择

集齐三段记忆后出口开启，玩家有三个结局：

| 结局 | 触发方式 |
|---|---|
| `save` 保存 | 按 `E` |
| `network` 放回网络 | 按 `Q` |
| `stay` 停留 | 什么都不做，停留 12 秒后自动触发 |

---

## 快速开始

### Godot 端（当前主线）

用 Godot **4.7** 打开 `godot/project.godot`，按 `F5` 运行。或命令行：

```powershell
cd godot
godot --path .
```

想在 Godot 窗口里看到自己的摄像头画面（可选）：

```powershell
py -3 scripts/godot_camera_bridge.py --device "你的摄像头名称"
```

设备名可用 `ffmpeg -f dshow -list_devices true -i dummy` 查询，也可以直接双击根目录的 `启动Godot摄像头.bat`。

### 网页端 / 桌面端（早期原型）

Windows 用户可直接双击 `启动网页端.bat` 或 `启动桌面端.bat`。手动启动：

```bash
npm install          # postinstall 会自动把 MediaPipe 模型与 wasm 落到 public/
npm run dev          # http://localhost:5173
npm run dev:desktop  # Electron 桌面端
```

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器（等同 `dev:web`） |
| `npm run dev:desktop` | Electron 桌面端（Vite 起在 5174） |
| `npm run build` | 类型检查 + 产物构建 |
| `npm run typecheck` | 只做类型检查 |
| `npm run setup:models` | 重新本地化 MediaPipe 模型（正常由 postinstall 自动执行） |

---

## 操作

| 行为 | 键鼠 | 视觉识别 |
|---|---|---|
| 移动 | `W` `A` `S` `D` / 方向键 | 手掌位置 |
| 跳跃 | `空格` | 抓握动作 |
| 奔跑 | `Shift` | — |
| 爬行 | `Ctrl` | — |
| 交互 / 读取记忆 / 返回 | `E` | — |
| 退出街机 | `ESC` | — |

网页端调试快捷键：`D` 开关调试面板 · `V` 显示摄像头预览 · `R` 重置体验。

---

## 视觉识别协议

游戏通过 UDP `127.0.0.1:6401` 接收标准化的手部状态 JSON：

```json
{"x":0.5,"y":0.5,"grab":0.0,"spread":0.8,"confidence":0.95}
```

- `x` / `y`：0–1 的画面归一化坐标
- `grab` / `spread`：0–1 的手势强度
- `confidence` 低于 0.2 的帧会被直接丢弃
- 识别进程断开超过 0.35 秒后自动切回鼠标模式，现场演示不会卡死

任意 MediaPipe / OpenCV 进程只要往这个端口发 JSON 就能接入，不绑定具体实现。

> 说明：Godot Windows 桌面版的 `CameraServer` 只支持平台 / AR camera feed，不会枚举普通 USB 摄像头。所以真实画面由外部进程（`scripts/godot_camera_bridge.py`）采集后通过 UDP `6402` 送进游戏右下角的预览窗。

---

## 目录结构

```
godot/                          当前主线：奶蛙：遗忘档案馆（Godot 4.7）
├── project.godot               项目配置，主场景 res://main.tscn
├── main.tscn                   奶蛙 / 侧视电影镜头 / 剧情导演 / 交互栈
├── scenes/                     archive_space · intro_space · time_tunnel · player · interface
├── scripts/
│   ├── opening_director.gd     开场演出，十拍状态机
│   ├── mitosis_act.gd          分裂桥段：奶蛙分裂出妈妈、无字对话
│   ├── boot_terminal.gd        世界内的 CRT 终端，SubViewport 贴到 3D 面片
│   ├── archive_details.gd      档案馆程序化建模与陈设
│   ├── archive_interaction.gd  三段记忆交互 + 三种结局
│   ├── archive_npc_dialogue.gd 档案员 NPC 对话与记忆传送门
│   ├── archive_arcade.gd       三台街机主控
│   ├── arcade_snake.gd         贪吃蛇
│   ├── arcade_tetris.gd        俄罗斯方块
│   ├── arcade_breakout.gd      打砖块
│   ├── memory_destination.gd   三段记忆空间
│   ├── archive_fx.gd           氛围特效
│   ├── archive_posters.gd      霓虹海报
│   ├── camera_director.gd      镜头导演：cinematic / follow + 统一震屏
│   ├── input_state.gd          输入归一化，键鼠优先、视觉识别兜底
│   ├── visual_recognition.gd   UDP 6401 视觉识别接入
│   ├── vision_preview.gd       右下角预览窗，UDP 6402
│   └── check_*.gd              无头检查脚本
├── assets/
│   ├── audio/                  12 段音效与人声
│   └── character/              yellow_character.glb
└── addons/godot_mcp/           编辑器内 MCP 插件（TCP 6400）

src/                            早期 web 原型（Vite + TS + Three.js + MediaPipe）
desktop/                        Electron 桌面端外壳
public/                         MediaPipe 模型与 wasm（约 42MB，离线可用）
scripts/                        建模、音频、摄像头与 MCP 桥接脚本
docs/                           合作开发文档
art/                            角色美术源文件（Blender）
项目构思.md                      最初的完整设计思路
```

---

## 开发工具

| 脚本 | 作用 |
|---|---|
| `scripts/build_character.py` | 在 Blender 里构建角色与游戏就绪的 GLB |
| `scripts/rig_character.py` | 给角色绑定骨骼（MilkFrog_Rig / MilkFrog_Skeleton） |
| `scripts/animate_character.py` | 为角色追加开场表演用的 blend shape |
| `scripts/build_opening_audio.py` | 程序化生成开场的全部音效层，不依赖外部采样 |
| `scripts/setup-models.mjs` | 把 MediaPipe 运行时与模型本地化到 `public/` |
| `scripts/godot_camera_bridge.py` | 摄像头画面 → UDP 6402（需系统 ffmpeg） |
| `scripts/mediapipe_camera_bridge.py` | 摄像头 + MediaPipe → 手部状态 UDP 6401 |
| `scripts/godot_mcp_bridge.py` | 把 Godot 编辑器插件桥接成 stdio MCP |

Godot 端的无头检查：

```powershell
# 输出走廊各点位与三个记忆房间的截图
godot --path godot --script res://scripts/check_archive.gd -- --capture

# 无头验证三个街机小游戏逻辑
godot --path godot --script res://scripts/check_minigames.gd
```

---

## 已知注意事项

- `public/` 里的 MediaPipe 模型与 wasm 约 42MB，已全部本地化，断网也能跑。**别删这个目录。**
- 现场演示时光线要好，找一面干净白墙做背景；背景有人走过会直接污染手部识别。
- 建议用外接摄像头或 USB 延长线，把摄像头架到 1.5–2m 外，视角更宽。
- 笔记本摄像头拍不到全身，所以整个项目只用手部输入——这是刻意的设计取舍。
- `npm run build` 时 three 相关 chunk 超过 500KB 的警告可以无视（本地运行，不部署 CDN）。

---

完整设计思路见 **`项目构思.md`**；Godot 端的场景与交互细节见 **`godot/README.md`**。
