@echo off
setlocal

cd /d "%~dp0"
title Wisp Field Development Server

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js 20 or newer from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js and enable npm.
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

echo [Wisp Field] Starting the development server...
echo [Wisp Field] The browser will open automatically. Press Ctrl+C to stop.
call npm run dev -- --open

if errorlevel 1 (
  echo [ERROR] The development server stopped unexpectedly.
  pause
  exit /b 1
)

endlocal
