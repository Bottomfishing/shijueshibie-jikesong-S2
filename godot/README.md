# 奶蛙：遗忘档案馆

Godot 4 场景原型。使用程序化几何搭建废弃网络档案馆，通过横向电影镜头、巨大工业设施、前景遮挡和冷暖光对比形成阴森童话氛围。

运行：用 Godot 打开本目录的 `project.godot`，按 F6/F5；或执行：

```powershell
& 'C:\Users\72417\AppData\Local\Programs\Godot\Godot_v4.7.2-stable_win64.exe' --path .
```

操作：A/D 左右移动，W/S 向场景深处/近处移动，也支持方向键；空格跳跃。斜向移动不会加速，前后活动限制在柜前通道内。

### 奶蛙动作系统

游玩阶段由 `scripts/main.gd` 统一驱动输入、物理和视觉动作：

- `idle`：轻微呼吸和身体摆动；
- `walk` / `run`：按速度切换步频，手臂、大小腿和脚掌反向摆动；按住 Shift 奔跑；
- `crawl`：按住 Ctrl 进入低姿态爬行；
- `jump` / `fall`：起跳拉伸、下落展开，并支持 0.14 秒土狼时间与 0.16 秒跳跃缓冲；
- `land`：落地压缩回弹、落地音效和轻微镜头震动。

视觉识别输入与键鼠共用同一套状态机：手掌位置负责移动，抓握动作负责跳跃；动作视觉只缩放 `CharacterVisual`，不会改变碰撞胶囊。

场景光照：四盏带阴影的冷暖吊灯、故障屏幕青色补光、暖色出口光及主角弱补光。档案柜包含 2016—2026 年代标牌、索引卡、把手、磨损材质和散落档案。细节集中在 `scripts/archive_details.gd`。

渲染检查：Godot 加 `--script res://scripts/check_archive.gd -- --capture` 可输出入口、中段、出口截图到 Godot 用户数据目录。

## 视觉识别接入

项目已接入 `scripts/visual_recognition.gd`。它在 `127.0.0.1:6401` 监听 UDP JSON，接收 MediaPipe/OpenCV 等识别进程输出的标准化手部状态：

```json
{"x":0.5,"y":0.5,"grab":0.0,"spread":0.8,"confidence":0.95}
```

`x/y` 为 0—1 的画面坐标，`grab` 和 `spread` 为 0—1，`confidence` 低于 0.2 的帧会被丢弃。收到有效帧时，角色移动由手掌位置驱动；识别进程断开超过 0.35 秒后自动切回鼠标模式。

注意：Godot 4.6 Windows 桌面版的 `CameraServer` 仅支持平台/AR camera feed，不会直接枚举普通 USB webcam（例如 ASUS FHD webcam）。如需在 Godot 窗口显示真实用户画面，应由浏览器 MediaPipe 页面或独立 OpenCV/MediaPipe 采集进程读取摄像头，并将视频帧通过共享纹理/本地流接入；UDP 识别状态接口仍可直接使用。

Windows 桌面摄像头桥接：先启动 Godot，再运行 `py -3 scripts/godot_camera_bridge.py --device "ASUS FHD webcam"`。脚本使用系统 FFmpeg 将 640×480 JPEG 帧发送到 `127.0.0.1:6402`，右下角预览会自动显示；设备名称可用 `ffmpeg -f dshow -list_devices true -i dummy` 查询。

### 大笑互动

分裂桥段里妈妈跳走后，奶蛙会先停住并在画面下方提示用户对着右下角摄像头大笑。摄像头桥接同时输出：

```json
{"face_detected":true,"smile":0.82,"laugh":true}
```

`smile` 由 OpenCV 人脸/笑容检测平滑到 0—1；连续达到 `0.58` 约 `0.65s` 才会触发奶蛙大笑，避免单帧误检。右下角预览会显示人脸框、笑容框和当前百分比。摄像头未连接时，提示会给出鼠标点击/空格兜底；等待超过 12 秒也会自动继续，不会卡死开场。
