# 麦浪精灵 · Wisp Field

> 吉客松 S2 参赛作品 · 主题赛道「没有对话框的产品」
> 站在摄像头前抬起手，唤醒一片金色麦田里沉睡的精灵。全程零文字、零教程、零对话框。

完整设计思路见 **`项目构思.md`**（先读它，再读这个）。

## 快速开始

Windows 用户可以直接双击项目根目录的 **`start-dev.bat`** 启动网页端，或双击 **`start-desktop.bat`** 启动桌面端。两个入口使用同一份 `src/` 代码和同一套资源。

也可以在终端中手动启动：

```bash
npm install        # postinstall 会自动把 MediaPipe 模型和 wasm 落到 public/
npm run dev        # 打开 http://localhost:5173
npm run dev:web    # 网页端开发（与 dev 等价）
npm run dev:desktop # Electron 桌面端开发
```

- 打开 http://localhost:5173 是进入页（名字未定先占位），点「进入」或按 Enter 跳转体验页 `/app.html`，URL 参数（如 `?input=mouse`）会自动带上。
- 首次运行会请求摄像头权限。拒绝或没摄像头也能进：会自动降级成鼠标模式。
- URL 加 `?input=mouse` 可跳过摄像头直接进。
- **D** 开关调试面板 · **V** 显示摄像头预览 · **R** 重置体验

### 两种运行方式

| 方式 | 命令 | 说明 |
|---|---|---|
| 网页端 | `npm run dev:web` | Vite 开发服务器，浏览器访问 `http://localhost:5173` |
| 桌面端 | `npm run dev:desktop` | 使用 5174 端口启动本地 Vite，再由 Electron 加载同一页面 |
| 桌面端产物验证 | `npm run build:desktop` 后 `npm run start:desktop` | 先构建 `dist/`，再由 Electron 加载构建结果 |

开发约定：业务功能只修改 `src/`；`desktop/` 只负责窗口和原生权限；网页端和桌面端都通过同一套 Vite 产物同步更新。

## 命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 类型检查 + 产物构建 |
| `npm run typecheck` | 只做类型检查 |
| `npm run setup:models` | 重新下载/本地化模型（正常由 postinstall 自动执行） |

## 代码结构（按数据流向读）

```
src/
├── main.ts                 启动流程：加载模型 → 摄像头（失败自动降级鼠标）→ 进场
├── config.ts               全部可调参数。现场调参就是在改这个文件
├── types.ts                PointerSource / PointerState 接口
├── core/
│   └── App.ts              装配 + 主循环。每帧顺序：指针→光点→导演→世界→渲染
├── input/                  输入层
│   ├── HandPointerSource   MediaPipe Hand Landmarker（本地模型，21 关键点/手）
│   ├── MousePointerSource  鼠标/触摸兜底。现场摄像头挂了就靠它
│   ├── PointerRouter       滤波 + 屏幕坐标→世界坐标 + 速度/能量派生 + 源切换
│   └── OneEuroFilter       抖动滤波。慢时强平滑、快时跟手，比低通好得多
├── world/                  世界
│   ├── WheatField          麦浪：InstancedBufferGeometry + 顶点着色器，一次 draw call
│   ├── Spirit              精灵：弹簧阻尼(欠阻尼) + 自主噪声 + 好奇行为
│   ├── Motes               光点：无文字教学的关键——靠近→吸引→收集
│   └── Environment         地面/远景石碑/雾。纪念碑谷语言：纯色块+雾化分层
├── director/
│   └── StoryDirector       三幕状态机：静止→唤醒→共生。参数全部时间平滑，绝不跳变
├── shaders/
│   ├── wheat.vert/frag     手部世界坐标作 uniform，距离平方衰减倒伏 + 行波风
│   └── halo.vert/frag      菲涅尔外发光（精灵和光点共用）
└── ui/
    └── DebugPanel          lil-gui 调试面板，改参数即时生效
```

## 现场开发时最可能动的地方

1. **`config.ts`** —— 所有手感参数（风力、手影响半径、精灵弹簧、光点吸引距离）
2. **`config.ts` → colors** —— 色调整个在 `wheat.colors` 里，配合调试面板实时看
3. **`StoryDirector.ts` → PROFILES** —— 每一幕的"世界状态"参数
4. **`wheat.vert.glsl`** —— 想让麦浪形态更好看就改弯曲曲线 `pow(t, 1.65)` 和衰减系数

## 已知注意事项

- 模型和 wasm 已全部本地化在 `public/`（共约 42MB），现场断网也能跑。**别删 public 目录**。
- 现场光线差就开补光灯，选干净白墙做背景，否则手部识别会飘。
- `npm run build` 里 three chunk 超 500KB 的警告可以无视（本地运行场景，不部署 CDN）。
