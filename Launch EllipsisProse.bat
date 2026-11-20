@echo off
setlocal
cd /d "%~dp0"
title EllipsisProse Launcher

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found on PATH. Install Node 18+ from https://nodejs.org and run this again.
    pause
    exit /b 1
)

node "%~dp0launch.js" %*
if errorlevel 1 (
    echo.
    echo EllipsisProse Launcher encountered an error. Review messages above.
    if not defined ELLIPSISPROSE_BATCH_NOPAUSE pause
    exit /b 1
)

ping 127.0.0.1 -n 3 >nul
endlocal
