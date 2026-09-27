@echo off
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0"
title GrapeLeafi QQBot - First-time Setup

echo [1/3] Installing Node dependencies...
pushd "%~dp0client"
call npm.cmd install --no-audit --no-fund --loglevel=error
popd

echo [2/3] Preparing NapCat protocol side (skip if already present)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\download-napcat.ps1"

rem ---- Create config.json from the template so a fresh clone just runs ----
rem Without this, main.js exits with "cannot read config file ... ENOENT",
rem which is a very confusing first experience.
echo [3/3] Creating config.json from template...
if not exist "%~dp0client\config.json" (
    if exist "%~dp0client\config.example.json" (
        copy /y "%~dp0client\config.example.json" "%~dp0client\config.json" >nul
        echo       Created client\config.json from config.example.json
        echo       You do NOT need to edit it. The access token, the NapCat reverse-WS
        echo       entry and the owner QQ number are all filled in automatically
        echo       (the owner becomes whoever scans the QR code to log in).
    ) else (
        echo       [WARN] config.example.json not found. Copy it to config.json manually.
    )
) else (
    echo       client\config.json already exists - keeping it untouched.
)

echo.
echo ==========================================================
echo  Setup done
echo ==========================================================
echo   1. Double-click start.bat to launch
echo   2. Scan the QR code with QQ to log into NapCat (first run only)
echo   3. That's it - owner permissions and private chat work out of the box.
echo      To change anything later, open the console (it prints the URL) and
echo      use the "Settings" page.
echo.
pause