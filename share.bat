@echo off
REM ===============================================================
REM  GrapeLeafi QQBot - build a clean, shareable copy
REM
REM  THIS FILE MUST STAY ASCII-ONLY.
REM  cmd.exe reads .bat using the OEM codepage (936 on zh-CN), not
REM  UTF-8. Chinese text in here gets decoded as garbage, and a
REM  mangled full-width character can break the parser hard enough
REM  that the *next* line is executed as a command - which is what
REM  happened. So: English in the .bat, Chinese in the Node output.
REM  Same rule as install.bat / start.bat, which are also ASCII.
REM ===============================================================
setlocal
cd /d "%~dp0"
title GrapeLeafi QQBot - Make a clean shareable copy

echo.
echo ==========================================================
echo  Building a clean shareable copy
echo ==========================================================
echo  Removed automatically:
echo    client\config.json   your QQ, tokens, AI key
echo    client\data\         real user data (checkin, points, cards)
echo    bot\                 NapCat incl. per-QQ login state
echo    node_modules\        rebuild with npm install
echo    assets\              2GB of third-party images
echo.
echo  Output goes to: <project>-share  next to this folder
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [FAIL] node not found. Please install Node.js 18 or newer.
    pause
    exit /b 1
)

node "%~dp0scripts\make-share.mjs" %*
set RC=%errorlevel%

echo.
if not "%RC%"=="0" (
    echo [FAIL] Build failed. See the messages above.
) else (
    echo [OK] Done. Install it from the output folder and make sure it
    echo      runs before you send it to anyone.
)
pause
exit /b %RC%
