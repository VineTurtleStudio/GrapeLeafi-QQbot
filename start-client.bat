@echo off
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0"
title GrapeLeafi QQBot - Client

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-client.ps1"
echo.
echo Client exited. Press any key to close...
pause >nul