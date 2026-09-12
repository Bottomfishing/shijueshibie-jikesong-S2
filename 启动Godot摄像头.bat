@echo off
cd /d "%~dp0"
echo 正在启动笔记本摄像头桥接...
if exist ".vision-venv\Scripts\python.exe" (
  echo 已启动 MediaPipe 手部识别与摄像头桥接（请勿再启动旧的 godot_camera_bridge.py）
  .vision-venv\Scripts\python.exe scripts\mediapipe_camera_bridge.py
) else (
  py -3 scripts\godot_camera_bridge.py --device "ASUS FHD webcam"
)
if errorlevel 1 pause
