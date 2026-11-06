@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title EllipsisProse Audio Studio (TTS Backend)

rem ---------------------------------------------------------------------------
rem Starts only the components required for Audio Drama TTS:
rem   Audio Studio Bridge (Hybrid Studio TTS: Breeze 2 + MOSS-TTSD) -> http://127.0.0.1:5020
rem   Proxies inference requests to local Audio.cpp daemon -> http://127.0.0.1:8080
rem ---------------------------------------------------------------------------

set "LAUNCH=start"
if defined ELLIPSISPROSE_BACKENDS_DRYRUN set "LAUNCH=echo DRY-RUN start"

rem --- 1. Verify Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found on PATH. Install Node 18+ from https://nodejs.org and run this again.
    pause
    exit /b 1
)

rem --- 2. Audio Studio Bridge, minimized (skipped if port 5020 is already listening)
netstat -ano | findstr /r /c:":5020 .*LISTENING" >nul
if errorlevel 1 (
    %LAUNCH% "EllipsisProse Audio Studio Bridge" /min cmd /k "cd /d "%~dp0" && npm run audio-bridge"
    echo Audio Studio Bridge starting on http://127.0.0.1:5020 ^(minimized window^).
) else (
    echo Audio Studio Bridge is already listening on port 5020.
)

echo.
echo ===========================================================================
echo Audio Drama TTS is active:
echo   - Audio Studio Bridge: http://127.0.0.1:5020
echo   - Audio.cpp Daemon:    http://127.0.0.1:8080
echo.
echo In EllipsisProse Settings -^> Audio Drama:
echo   Synthesis Backend: Audio.cpp (Local)
echo   Bridge URL:        http://127.0.0.1:5020
echo   Audio.cpp URL:     http://127.0.0.1:8080
echo ===========================================================================
echo.

if not defined ELLIPSISPROSE_BACKENDS_DRYRUN ping 127.0.0.1 -n 6 >nul
endlocal
