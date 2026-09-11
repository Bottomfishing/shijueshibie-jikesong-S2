@echo off
setlocal

cd /d "%~dp0"
title Wisp Field Desktop Development

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [Wisp Field] Installing dependencies for the first launch...
  call npm install
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
  )
)

echo [Wisp Field] Starting the desktop development window...
call npm run dev:desktop

if errorlevel 1 pause
endlocal
