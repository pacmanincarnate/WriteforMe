@echo off
setlocal
cd /d "%~dp0"
title EllipsisProse Launcher

rem Project needs Node 20.19+; put the known Node 22 install first on PATH for this window only.
if exist "%LOCALAPPDATA%\hermes\node\node.exe" set "PATH=%LOCALAPPDATA%\hermes\node;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found on PATH. Install Node 20.19+ ^(Node 22 recommended^) from https://nodejs.org and run this again.
    if not defined ELLIPSISPROSE_BATCH_NOPAUSE pause
    exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 20 (
    echo Node %NODE_MAJOR% is too old. EllipsisProse needs Node 20.19 or newer ^(Node 22 recommended^).
    if not defined ELLIPSISPROSE_BATCH_NOPAUSE pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies ^(first run only^)...
    call npm ci
    if errorlevel 1 (
        echo npm ci failed.
        if not defined ELLIPSISPROSE_BATCH_NOPAUSE pause
        exit /b 1
    )
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
