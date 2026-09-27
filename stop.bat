@echo off
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0"
title GrapeLeafi QQBot - Stop

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-client.ps1"
echo.
echo Press any key to close...
pause >nul
