@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 麦浪精灵 - 桌面端开发
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node.js 20 或更高版本。
  pause
  exit /b 1
)
if not exist "node_modules\" (
  echo [麦浪精灵] 首次启动，正在安装项目依赖……
  call npm install
)
if errorlevel 1 (
  echo [错误] 项目依赖安装失败，请检查网络或 npm 配置。
  pause
  exit /b 1
)
echo [麦浪精灵] 正在启动桌面端开发窗口……
echo [麦浪精灵] 关闭桌面窗口或按 Ctrl+C 可停止程序。
call npm run dev:desktop
if errorlevel 1 (
  echo [错误] 桌面端程序异常停止。
  pause
  exit /b 1
)
endlocal