@echo off
setlocal
cd /d "%~dp0"
title Wisp Field Desktop Development
where node >nul 2>nul || (echo [ERROR] Node.js is required.&pause&exit /b 1)
if not exist "node_modules\" call npm install
if errorlevel 1 (echo [ERROR] Dependency installation failed.&pause&exit /b 1)
call npm run dev:desktop
if errorlevel 1 pause
endlocal
