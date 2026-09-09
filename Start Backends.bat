@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title EllipsisProse Backends

rem ---------------------------------------------------------------------------
rem Starts the local backends EllipsisProse can use, each in its own minimized
rem window:
rem   1. Codex bridge (text generation via your Codex CLI login, plus local
rem      embeddings) -> http://127.0.0.1:5010
rem   2. ComfyUI (Krea 2 image generation) -> http://127.0.0.1:8188
rem
rem Where ComfyUI lives is resolved in this order:
rem   a) backends.local.cmd next to this script (written by the folder picker)
rem   b) the ELLIPSISPROSE_COMFY_DIR environment variable
rem   c) common install locations (portable / Easy-Install / comfy-cli / clones)
rem   d) a folder picker, whose choice is saved to backends.local.cmd
rem Delete backends.local.cmd to choose again. Set COMFY_DIR=skip to never
rem start ComfyUI from here (for example when the ComfyUI desktop app runs it).
rem ---------------------------------------------------------------------------
set "COMFY_DIR="
set "LOCAL_CFG=%~dp0backends.local.cmd"
set "LAUNCH=start"
if defined ELLIPSISPROSE_BACKENDS_DRYRUN set "LAUNCH=echo DRY-RUN start"

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
    %LAUNCH% "EllipsisProse Codex Bridge" /min cmd /k "cd /d "%~dp0" && npm run codex-bridge"
    echo Codex bridge starting on http://127.0.0.1:5010 ^(minimized window^).
) else (
    echo Codex bridge already listening on port 5010, not starting another.
)

rem --- 3. ComfyUI (skipped if port 8188 is already in use, e.g. the desktop app)
netstat -ano | findstr /r /c:":8188 .*LISTENING" >nul
if not errorlevel 1 (
    echo ComfyUI already listening on port 8188, not starting another.
    goto :done
)

rem a) saved choice
if exist "%LOCAL_CFG%" call "%LOCAL_CFG%"
rem b) environment variable
if not defined COMFY_DIR if defined ELLIPSISPROSE_COMFY_DIR set "COMFY_DIR=%ELLIPSISPROSE_COMFY_DIR%"
if /i "%COMFY_DIR%"=="skip" (
    echo ComfyUI launch disabled ^(COMFY_DIR=skip^).
    goto :done
)
if defined COMFY_DIR if not exist "%COMFY_DIR%\ComfyUI\main.py" if not exist "%COMFY_DIR%\main.py" (
    echo Saved ComfyUI folder "%COMFY_DIR%" no longer contains ComfyUI. Looking again...
    set "COMFY_DIR="
)
rem c) common locations: portable/Easy-Install roots (python_embeded + ComfyUI\) and plain clones (main.py)
if not defined COMFY_DIR for %%D in (
    "%~dp0..\ComfyUI"
    "%~dp0..\ComfyUI-Easy-Install"
    "%~dp0..\ComfyUI_windows_portable"
    "%USERPROFILE%\comfy\ComfyUI"
    "%USERPROFILE%\ComfyUI"
    "%USERPROFILE%\ComfyUI_windows_portable"
    "%USERPROFILE%\Documents\ComfyUI"
    "C:\ComfyUI"
    "C:\ComfyUI_windows_portable"
    "D:\ComfyUI"
    "D:\ComfyUI_windows_portable"
) do (
    if not defined COMFY_DIR (
        if exist "%%~D\ComfyUI\main.py" set "COMFY_DIR=%%~D"
        if exist "%%~D\main.py" set "COMFY_DIR=%%~D"
    )
)
rem d) folder picker, remembered in backends.local.cmd
if not defined COMFY_DIR (
    echo ComfyUI was not found in the usual places. Choose your ComfyUI folder...
    for /f "usebackq delims=" %%P in (`powershell -NoProfile -STA -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Select your ComfyUI folder (the one containing ComfyUI\main.py or main.py). Cancel to skip ComfyUI.'; $d.ShowNewFolderButton = $false; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }"`) do set "COMFY_DIR=%%P"
    if not defined COMFY_DIR (
        echo No folder chosen. Skipping ComfyUI this time.
        goto :done
    )
    if not exist "!COMFY_DIR!\ComfyUI\main.py" if not exist "!COMFY_DIR!\main.py" (
        echo "!COMFY_DIR!" does not contain ComfyUI\main.py or main.py. Skipping ComfyUI.
        set "COMFY_DIR="
        goto :done
    )
    > "%LOCAL_CFG%" echo set "COMFY_DIR=!COMFY_DIR!"
    echo Saved ComfyUI folder to backends.local.cmd
)

rem Work out the layout: portable root (python_embeded + ComfyUI\) or a clone.
set "COMFY_MAIN=ComfyUI\main.py"
set "COMFY_PY="
if exist "%COMFY_DIR%\main.py" set "COMFY_MAIN=main.py"
if exist "%COMFY_DIR%\python_embeded\python.exe" set "COMFY_PY=.\python_embeded\python.exe -I -W ignore::FutureWarning"
if not defined COMFY_PY if exist "%COMFY_DIR%\venv\Scripts\python.exe" set "COMFY_PY=.\venv\Scripts\python.exe"
if not defined COMFY_PY if exist "%COMFY_DIR%\.venv\Scripts\python.exe" set "COMFY_PY=.\.venv\Scripts\python.exe"
if not defined COMFY_PY if exist "%COMFY_DIR%\ComfyUI\venv\Scripts\python.exe" set "COMFY_PY=.\ComfyUI\venv\Scripts\python.exe"
if not defined COMFY_PY if exist "%COMFY_DIR%\ComfyUI\.venv\Scripts\python.exe" set "COMFY_PY=.\ComfyUI\.venv\Scripts\python.exe"
if not defined COMFY_PY (
    where python >nul 2>nul
    if errorlevel 1 (
        echo Found ComfyUI at "%COMFY_DIR%" but no python_embeded, venv, or python on PATH. Start ComfyUI yourself with --enable-cors-header.
        goto :done
    )
    set "COMFY_PY=python"
)
set "COMFY_ARGS=--listen 127.0.0.1 --enable-cors-header"
if exist "%COMFY_DIR%\python_embeded\python.exe" set "COMFY_ARGS=--windows-standalone-build --cache-classic --disable-dynamic-vram %COMFY_ARGS%"

%LAUNCH% "ComfyUI" /min cmd /k "cd /d "%COMFY_DIR%" && set CUDA_DEVICE_ORDER=PCI_BUS_ID&& %COMFY_PY% %COMFY_MAIN% %COMFY_ARGS%"
echo ComfyUI starting from "%COMFY_DIR%" on http://127.0.0.1:8188 ^(minimized window, first start takes a minute^).

:done
echo.
echo In EllipsisProse Settings: Codex CLI ^(local^) / Codex Bridge ^(local^) use port 5010,
echo ComfyUI ^(local, Krea 2^) uses port 8188. Close the minimized windows to stop them.
if not defined ELLIPSISPROSE_BACKENDS_DRYRUN timeout /t 8 >nul
endlocal
