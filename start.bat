@echo off
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0"
title GrapeLeafi QQBot - Main

if not exist "%~dp0client\node_modules\ws" (
    echo [WARN] client dependencies missing. Installing now...
    pushd "%~dp0client"
    call npm.cmd install --no-audit --no-fund --loglevel=error
    popd
)

rem ---- Create config.json from the template ----
rem main.js can run off config.example.json in memory, but the file only gets
rem written on the first save. Creating it up front means the recipient sees a
rem real config.json to look at/edit instead of wondering where it went.
if not exist "%~dp0client\config.json" (
    if exist "%~dp0client\config.example.json" (
        copy /y "%~dp0client\config.example.json" "%~dp0client\config.json" >nul
        echo [OK] Created client\config.json from config.example.json
    ) else (
        echo [WARN] config.example.json not found. Copy it to config.json manually.
    )
)

if not exist "%~dp0bot\napcat\NapCatWinBootMain.exe" (
    echo [WARN] NapCat not found. Downloading now, may take a while...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\download-napcat.ps1"
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-all.ps1" %*
echo.
if errorlevel 1 (
    echo [ERROR] Something went wrong. Read the red message above, or run start-client.bat / start-napcat.bat separately.
) else (
    echo Bot exited. Press any key to close...
)
pause >nul