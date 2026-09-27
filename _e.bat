@echo on
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