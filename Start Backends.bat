@echo off
setlocal
cd /d "%~dp0"
title EllipsisProse Backends

rem ---------------------------------------------------------------------------
rem Starts the local backends EllipsisProse can use, each in its own minimized
rem window:
rem   1. Codex bridge (text generation via your Codex CLI login, plus local
rem      embeddings) -> http://127.0.0.1:5010
rem   2. ComfyUI (Krea 2 image generation) -> http://127.0.0.1:8188
rem
rem Set COMFY_DIR below (or the ELLIPSISPROSE_COMFY_DIR environment variable)
rem to your ComfyUI-Easy-Install folder, the one that contains python_embeded
rem and ComfyUI. Leave it blank to skip ComfyUI.
rem ---------------------------------------------------------------------------
set "COMFY_DIR=Y:\Comfy\ComfyUI-Easy-Install"
if defined ELLIPSISPROSE_COMFY_DIR set "COMFY_DIR=%ELLIPSISPROSE_COMFY_DIR%"

rem --- 1. npm packages for the Codex bridge + local embeddings (first run only)
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found on PATH. Install Node 18+ from https://nodejs.org and run this again.
    pause
    exit /b 1
)
if not exist "node_modules\@xenova\transformers\package.json" (
    echo Installing npm packages for the Codex bridge and local embeddings...
    call npm install
    if errorlevel 1 (
        echo npm install failed. See the output above.
        pause
        exit /b 1
    )
)

rem --- 2. Codex bridge, minimized (skipped if port 5010 is already in use)
netstat -ano | findstr /r /c:":5010 .*LISTENING" >nul
if errorlevel 1 (
    start "EllipsisProse Codex Bridge" /min cmd /k "cd /d "%~dp0" && npm run codex-bridge"
    echo Codex bridge starting on http://127.0.0.1:5010 ^(minimized window^).
) else (
    echo Codex bridge already listening on port 5010, not starting another.
)

rem --- 3. ComfyUI, minimized, with CORS enabled so the app can call it
if "%COMFY_DIR%"=="" goto :done
if not exist "%COMFY_DIR%\python_embeded\python.exe" (
    echo ComfyUI not found at "%COMFY_DIR%" ^(expected python_embeded\python.exe^). Skipping ComfyUI.
    goto :done
)
netstat -ano | findstr /r /c:":8188 .*LISTENING" >nul
if errorlevel 1 (
    start "ComfyUI" /min cmd /k "cd /d "%COMFY_DIR%" && set CUDA_DEVICE_ORDER=PCI_BUS_ID&& set CUDA_VISIBLE_DEVICES=0,1&& .\python_embeded\python.exe -I -W ignore::FutureWarning ComfyUI\main.py --windows-standalone-build --cache-classic --disable-dynamic-vram --listen 127.0.0.1 --enable-cors-header"
    echo ComfyUI starting on http://127.0.0.1:8188 ^(minimized window, first start takes a minute^).
) else (
    echo ComfyUI already listening on port 8188, not starting another.
)

:done
echo.
echo In EllipsisProse Settings: Codex CLI ^(local^) / Codex Bridge ^(local^) use port 5010,
echo ComfyUI ^(local, Krea 2^) uses port 8188. Close the minimized windows to stop them.
timeout /t 8 >nul
endlocal
