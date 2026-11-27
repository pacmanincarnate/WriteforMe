@echo off
setlocal
cd /d "%~dp0"
title EllipsisProse Stop All

rem Same Node the launcher uses; put the known Node 22 install first on PATH for this window only.
if exist "%LOCALAPPDATA%\hermes\node\node.exe" set "PATH=%LOCALAPPDATA%\hermes\node;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found on PATH, so no EllipsisProse service can be running from this folder.
    if not defined ELLIPSISPROSE_BATCH_NOPAUSE pause
    exit /b 1
)

rem stop.js stops the web server (3000), the Audio Studio Bridge (5020), the Codex and Claude bridges,
rem and what they started: ComfyUI, the built-in embedding server and Audio.cpp.
node "%~dp0stop.js" %*
if errorlevel 1 (
    echo.
    echo Something could not be stopped. Review messages above.
    if not defined ELLIPSISPROSE_BATCH_NOPAUSE pause
    exit /b 1
)

ping 127.0.0.1 -n 4 >nul
endlocal
