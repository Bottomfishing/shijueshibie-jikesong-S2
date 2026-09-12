# 奶蛙：遗忘档案馆

Godot 4 场景原型。使用程序化几何搭建霓虹赛博朋克风格的网络记忆档案馆，通过横向电影镜头、巨大工业设施、前景遮挡和青/品红霓虹光对比形成电子夜色氛围。

运行：用 Godot 打开本目录的 `project.godot`，按 F6/F5；或执行：

```powershell
godot --path .
```

操作：A/D 左右移动，W/S 向场景深处/近处移动，也支持方向键；空格跳跃。斜向移动不会加速，前后活动限制在柜前通道内。

场景光照：四盏带阴影的品红/青霓虹吊灯、故障屏幕青色补光、霓虹橙出口光及主角弱补光。三个档案柜（2016 / 2020 / 2024）包含年代标牌、索引卡、发光把手、磨损材质和散落档案，每柜前有一名档案员 NPC，对话结束后打开记忆传送门，分别通往霓虹夜市、深夜街镇和数据公园三个记忆场景。柜位之间的空白走廊摆有三台可玩街机（贪吃蛇 / 俄罗斯方块 / 打砖块，靠近按 E 进入、ESC 退出）和整墙霓虹海报。细节集中在 `scripts/archive_details.gd`、`scripts/archive_arcade.gd` 与 `scripts/archive_posters.gd`。

渲染检查：Godot 加 `--script res://scripts/check_archive.gd -- --capture` 可输出走廊各点位与三个记忆房间的截图到 Godot 用户数据目录；`--script res://scripts/check_minigames.gd` 无头验证三个街机小游戏逻辑。

## 视觉识别接入

项目已接入 `scripts/visual_recognition.gd`。它在 `127.0.0.1:6401` 监听 UDP JSON，接收 MediaPipe/OpenCV 等识别进程输出的标准化手部状态：

```json
{"x":0.5,"y":0.5,"grab":0.0,"spread":0.8,"confidence":0.95}
```

`x/y` 为 0—1 的画面坐标，`grab` 和 `spread` 为 0—1，`confidence` 低于 0.2 的帧会被丢弃。收到有效帧时，角色移动由手掌位置驱动；识别进程断开超过 0.35 秒后自动切回鼠标模式。

注意：Godot 4.6 Windows 桌面版的 `CameraServer` 仅支持平台/AR camera feed，不会直接枚举普通 USB webcam（例如 ASUS FHD webcam）。如需在 Godot 窗口显示真实用户画面，应由浏览器 MediaPipe 页面或独立 OpenCV/MediaPipe 采集进程读取摄像头，并将视频帧通过共享纹理/本地流接入；UDP 识别状态接口仍可直接使用。

Windows 桌面摄像头桥接：先启动 Godot，再运行 `py -3 scripts/godot_camera_bridge.py --device "ASUS FHD webcam"`。脚本使用系统 FFmpeg 将 640×480 JPEG 帧发送到 `127.0.0.1:6402`，右下角预览会自动显示；设备名称可用 `ffmpeg -f dshow -list_devices true -i dummy` 查询。
