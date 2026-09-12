# 奶蛙：遗忘档案馆

Godot 4 场景原型。使用程序化几何搭建霓虹赛博朋克风格的网络记忆档案馆，通过横向电影镜头、巨大工业设施、前景遮挡和青/品红霓虹光对比形成电子夜色氛围。

运行：用 Godot 打开本目录的 `project.godot`，按 F6/F5；或执行：

```powershell
godot --path .
```

操作：A/D 左右移动，W/S 向场景深处/近处移动，也支持方向键；空格跳跃。斜向移动不会加速，前后活动限制在柜前通道内。

场景光照：四盏带阴影的品红/青霓虹吊灯、故障屏幕青色补光、霓虹橙出口光及主角弱补光。三个档案柜（2016 / 2020 / 2024）包含年代标牌、索引卡、发光把手、磨损材质和散落档案，每柜前有一名档案员 NPC，对话结束后打开记忆传送门，分别通往霓虹夜市、深夜街镇和数据公园三个记忆场景。柜位之间的空白走廊摆有三台可玩街机（贪吃蛇 / 俄罗斯方块 / 打砖块，靠近按 E 进入、ESC 退出）和整墙霓虹海报。细节集中在 `scripts/archive_details.gd`、`scripts/archive_arcade.gd` 与 `scripts/archive_posters.gd`。

渲染检查：Godot 加 `--script res://scripts/check_archive.gd -- --capture` 可输出走廊各点位与三个记忆房间的截图到 Godot 用户数据目录；`--script res://scripts/check_minigames.gd` 无头验证三个街机小游戏逻辑。
