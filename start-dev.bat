@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 麦浪精灵 - 网页端开发
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
echo [麦浪精灵] 正在启动网页端开发服务器……
echo [麦浪精灵] 浏览器将自动打开，按 Ctrl+C 可停止服务器。
call npm run dev:web -- --open
if errorlevel 1 (
  echo [错误] 网页端开发服务器异常停止。
  pause
  exit /b 1
)
endlocal