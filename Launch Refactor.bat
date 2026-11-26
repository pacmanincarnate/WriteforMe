@echo off
setlocal
cd /d "%~dp0"
title EllipsisProse (Refactor) Launcher

rem Project needs Node 20.19+; put the known Node 22 install first on PATH for this window only.
if exist "%LOCALAPPDATA%\hermes\node\node.exe" set "PATH=%LOCALAPPDATA%\hermes\node;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found. Install Node 22 from https://nodejs.org and run this again.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 20 (
    echo Node %NODE_MAJOR% is too old. This project needs Node 20.19 or newer.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies ^(first run only^)...
    call npm ci
    if errorlevel 1 ( echo npm ci failed. & pause & exit /b 1 )
)

rem launch.js builds dist\ if missing, starts the web server (3000) and the Audio Studio Bridge (5020),
rem opens the browser, and pre-warms Audio.cpp.
node "%~dp0launch.js" %*
if errorlevel 1 (
    echo.
    echo Launcher encountered an error. Review messages above.
    pause
    exit /b 1
)
ping 127.0.0.1 -n 3 >nul
endlocal
