@echo off
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0"
title GrapeLeafi QQBot - NapCat

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-napcat.ps1" %*
echo.
echo NapCat exited. Press any key to close...
pause >nul