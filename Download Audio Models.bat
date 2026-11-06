@echo off
setlocal EnableDelayedExpansion
title EllipsisProse - Audio Drama Model Downloader
cd /d "%~dp0"

echo ===============================================================================
echo            EllipsisProse Audio Studio - Model Downloader
echo          Breeze 2 TTS + MOSS-TTSD + Whisper Verifier + VAD
echo ===============================================================================
echo.

rem ---------------------------------------------------------------------------
rem 1. Determine Target Directory for Audio.cpp models and CLI parameters
rem ---------------------------------------------------------------------------
set "PARAM1=%~1"
set "PARAM2=%~2"
set "NON_INTERACTIVE=0"
set "CLI_CHOICE="

rem Check if first param is a direct choice number (1-4) or "all"
if "%PARAM1%"=="1" (set "CLI_CHOICE=1" & set "NON_INTERACTIVE=1" & set "TARGET_DIR=")
if "%PARAM1%"=="2" (set "CLI_CHOICE=2" & set "NON_INTERACTIVE=1" & set "TARGET_DIR=")
if "%PARAM1%"=="3" (set "CLI_CHOICE=3" & set "NON_INTERACTIVE=1" & set "TARGET_DIR=")
if "%PARAM1%"=="4" (set "CLI_CHOICE=4" & set "NON_INTERACTIVE=1" & set "TARGET_DIR=")
if /i "%PARAM1%"=="all" (set "CLI_CHOICE=1" & set "NON_INTERACTIVE=1" & set "TARGET_DIR=")

if not defined CLI_CHOICE if defined PARAM1 (
    set "TARGET_DIR=%PARAM1%"
    if "%PARAM2%"=="1" (set "CLI_CHOICE=1" & set "NON_INTERACTIVE=1")
    if "%PARAM2%"=="2" (set "CLI_CHOICE=2" & set "NON_INTERACTIVE=1")
    if "%PARAM2%"=="3" (set "CLI_CHOICE=3" & set "NON_INTERACTIVE=1")
    if "%PARAM2%"=="4" (set "CLI_CHOICE=4" & set "NON_INTERACTIVE=1")
    if /i "%PARAM2%"=="all" (set "CLI_CHOICE=1" & set "NON_INTERACTIVE=1")
)

set "LOCAL_CFG=%~dp0backends.local.cmd"

if not defined TARGET_DIR (
    if exist "%LOCAL_CFG%" (
        for /f "usebackq tokens=1,* delims==" %%A in ("%LOCAL_CFG%") do (
            set "LINE_KEY=%%A"
            set "LINE_KEY=!LINE_KEY:"=!"
            if /i "!LINE_KEY!"=="set AUDIOCPP_DIR" set "TARGET_DIR=%%~B"
        )
    )
)

if not defined TARGET_DIR if defined ELLIPSISPROSE_AUDIOCPP_DIR (
    set "TARGET_DIR=%ELLIPSISPROSE_AUDIOCPP_DIR%"
)

if not defined TARGET_DIR (
    set "TARGET_DIR=%~dp0audiocpp"
)

rem Strip trailing slashes/quotes
if "!TARGET_DIR:~-1!."=="\." set "TARGET_DIR=!TARGET_DIR:~0,-1!"
if "!TARGET_DIR:~-1!."=="/." set "TARGET_DIR=!TARGET_DIR:~0,-1!"
set "TARGET_DIR=!TARGET_DIR:"=!"

echo Target Directory: "%TARGET_DIR%"
echo Models will be placed in: "%TARGET_DIR%\models"
echo.

rem ---------------------------------------------------------------------------
rem 2. Verify curl is available
rem ---------------------------------------------------------------------------
where curl >nul 2>nul
if errorlevel 1 (
    echo [ERROR] curl.exe was not found on your system PATH.
    echo Windows 10/11 includes curl by default. Please install curl or add it to PATH.
    pause
    exit /b 1
)

rem ---------------------------------------------------------------------------
rem 3. Interactive Menu
rem ---------------------------------------------------------------------------
:menu
if defined CLI_CHOICE (
    set "CHOICE=%CLI_CHOICE%"
    set "CLI_CHOICE="
    goto :process_choice
)
echo -------------------------------------------------------------------------------
echo Select download option:
echo.
echo   [1] Download ALL Models (~15.5 GB total - Full Audio Drama Studio)
echo       - Wave 1: Breeze 2 TTS Q8_0 + F16 Codec (~5.4 GB)
echo       - Wave 2: MOSS-TTSD Dialogue Engine Q8_0 + F16 Tokenizer (~10.0 GB)
echo       - Wave 3: Whisper Base ASR Q8_0 + VAD (~155 MB)
echo.
echo   [2] Wave 1 Only: Breeze 2 TTS (Voice Design + Narration, ~5.4 GB)
echo   [3] Wave 2 Only: MOSS-TTSD (Multi-Speaker Dialogue Engine, ~10.0 GB)
echo   [4] Wave 3 Only: Whisper Verifier + VAD (Silence Trimming & ASR, ~155 MB)
echo   [5] Change Target Directory
echo   [6] Exit
echo -------------------------------------------------------------------------------
set /p "CHOICE=Enter choice [1-6] (Default is 1): "
if not defined CHOICE set "CHOICE=1"

:process_choice
if "%CHOICE%"=="1" goto :download_all
if "%CHOICE%"=="2" goto :download_wave1
if "%CHOICE%"=="3" goto :download_wave2
if "%CHOICE%"=="4" goto :download_wave3
if "%CHOICE%"=="5" goto :change_dir
if "%CHOICE%"=="6" goto :done

echo Invalid selection. Please choose 1 to 6.
echo.
goto :menu

:change_dir
echo.
set /p "NEW_DIR=Enter custom directory path for Audio.cpp (or leave blank to cancel): "
if defined NEW_DIR (
    set "TARGET_DIR=%NEW_DIR:"=%"
    echo Updated target to: "!TARGET_DIR!"
)
echo.
goto :menu

rem ---------------------------------------------------------------------------
rem Download Routines
rem ---------------------------------------------------------------------------
:download_all
call :do_wave1
call :do_wave2
call :do_wave3
goto :finished

:download_wave1
call :do_wave1
goto :finished

:download_wave2
call :do_wave2
goto :finished

:download_wave3
call :do_wave3
goto :finished

rem ---------------------------------------------------------------------------
rem Wave 1: Breeze 2 TTS
rem ---------------------------------------------------------------------------
:do_wave1
echo.
echo ===============================================================================
echo [WAVE 1] Downloading Breeze 2 TTS Models
echo ===============================================================================
set "W1_DIR=%TARGET_DIR%\models\breeze2"
if not exist "%W1_DIR%" mkdir "%W1_DIR%"

rem 1. Breeze 2 Backbone Q8_0
call :download_file "https://huggingface.co/HoppouAI/Breeze-TTS-2.cpp/resolve/main/breeze-tts-2-q8_0.gguf" "%W1_DIR%\breeze-tts-2-q8_0.gguf" "Breeze 2 TTS Backbone (Q8_0, ~5.1 GB)"

rem 2. Breeze 2 Codec F16
call :download_file "https://huggingface.co/HoppouAI/Breeze-TTS-2.cpp/resolve/main/breeze-tts-2-f16.gguf" "%W1_DIR%\breeze-codec-f16.gguf" "Breeze 2 Audio Codec (F16, ~320 MB)"

exit /b 0

rem ---------------------------------------------------------------------------
rem Wave 2: MOSS-TTSD Multi-Speaker Dialogue
rem ---------------------------------------------------------------------------
:do_wave2
echo.
echo ===============================================================================
echo [WAVE 2] Downloading MOSS-TTSD Dialogue Models
echo ===============================================================================
set "W2_DIR=%TARGET_DIR%\models\moss_ttsd"
if not exist "%W2_DIR%" mkdir "%W2_DIR%"

rem 1. MOSS-TTSD Backbone Q8_0
call :download_file "https://huggingface.co/hans00/MOSS-TTSD-v0.7-GGUF/resolve/main/moss-ttsd-v0.7-q8_0.gguf" "%W2_DIR%\moss-ttsd-v1.0-q8_0.gguf" "MOSS-TTSD Dialogue Backbone (Q8_0, ~9.5 GB)"

rem 2. MOSS Audio Tokenizer F16
call :download_file "https://huggingface.co/hans00/MOSS-TTSD-v0.7-GGUF/resolve/main/codec-f16.gguf" "%W2_DIR%\moss-audio-tokenizer-f16.gguf" "MOSS Audio Tokenizer / Codec (F16, ~480 MB)"

exit /b 0

rem ---------------------------------------------------------------------------
rem Wave 3: Whisper Verifier + VAD
rem ---------------------------------------------------------------------------
:do_wave3
echo.
echo ===============================================================================
echo [WAVE 3] Downloading Whisper Verifier + VAD Models
echo ===============================================================================
set "W3_WHISPER_DIR=%TARGET_DIR%\models\whisper"
set "W3_VAD_DIR=%TARGET_DIR%\models\vad"
if not exist "%W3_WHISPER_DIR%" mkdir "%W3_WHISPER_DIR%"
if not exist "%W3_VAD_DIR%" mkdir "%W3_VAD_DIR%"

rem 1. Whisper Base Q8_0
call :download_file "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q8_0.bin" "%W3_WHISPER_DIR%\whisper-base.en-q8_0.gguf" "Whisper Base ASR Verifier (Q8_0, ~140 MB)"

rem 2. Earshot / Silero VAD
call :download_file "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin" "%W3_VAD_DIR%\earshot-vad-f16.gguf" "VAD Silence Boundary Model (~15 MB)"

exit /b 0

rem ---------------------------------------------------------------------------
rem Helper: Download with curl (resumable)
rem ---------------------------------------------------------------------------
:download_file
set "SRC_URL=%~1"
set "DST_FILE=%~2"
set "DESC=%~3"

echo.
echo --- %DESC% ---
echo Destination: "%DST_FILE%"

if exist "%DST_FILE%" (
    for %%F in ("%DST_FILE%") do set "FILE_SIZE=%%~zF"
    if !FILE_SIZE! gtr 1048576 (
        echo File already exists (!FILE_SIZE! bytes^).
        echo Resuming / checking integrity with server...
    )
)

rem curl options:
rem   -f: fail fast on HTTP errors
rem   -L: follow redirects (Hugging Face 302 -> CDN)
rem   -C -: resume partial downloads automatically
rem   --retry: retry up to 5 times on connection drops
rem   --retry-delay: 3 seconds between retries
rem   -#: progress bar
curl.exe -f -L -C - --retry 5 --retry-delay 3 -# -o "%DST_FILE%" "%SRC_URL%"

if errorlevel 1 (
    echo [WARNING] Download encountered an issue for: "%DESC%"
    echo If the transfer was interrupted, run this script again to resume.
) else (
    echo [SUCCESS] "%DESC%" is ready.
)
exit /b 0

rem ---------------------------------------------------------------------------
rem Summary & Completion
rem ---------------------------------------------------------------------------
:finished
echo.
echo ===============================================================================
echo                          Download Summary
echo ===============================================================================
echo.
echo Checking model files in: "%TARGET_DIR%\models"
echo.

set "MISSING=0"

rem Check Wave 1
if exist "%TARGET_DIR%\models\breeze2\breeze-tts-2-q8_0.gguf" (
    echo [OK] Wave 1: models\breeze2\breeze-tts-2-q8_0.gguf
) else (
    echo [MISSING] Wave 1: models\breeze2\breeze-tts-2-q8_0.gguf
    set /a MISSING+=1
)
if exist "%TARGET_DIR%\models\breeze2\breeze-codec-f16.gguf" (
    echo [OK] Wave 1: models\breeze2\breeze-codec-f16.gguf
) else (
    echo [MISSING] Wave 1: models\breeze2\breeze-codec-f16.gguf
    set /a MISSING+=1
)

rem Check Wave 2
if exist "%TARGET_DIR%\models\moss_ttsd\moss-ttsd-v1.0-q8_0.gguf" (
    echo [OK] Wave 2: models\moss_ttsd\moss-ttsd-v1.0-q8_0.gguf
) else (
    echo [MISSING] Wave 2: models\moss_ttsd\moss-ttsd-v1.0-q8_0.gguf
    set /a MISSING+=1
)
if exist "%TARGET_DIR%\models\moss_ttsd\moss-audio-tokenizer-f16.gguf" (
    echo [OK] Wave 2: models\moss_ttsd\moss-audio-tokenizer-f16.gguf
) else (
    echo [MISSING] Wave 2: models\moss_ttsd\moss-audio-tokenizer-f16.gguf
    set /a MISSING+=1
)

rem Check Wave 3
if exist "%TARGET_DIR%\models\whisper\whisper-base.en-q8_0.gguf" (
    echo [OK] Wave 3: models\whisper\whisper-base.en-q8_0.gguf
) else (
    echo [MISSING] Wave 3: models\whisper\whisper-base.en-q8_0.gguf
    set /a MISSING+=1
)
if exist "%TARGET_DIR%\models\vad\earshot-vad-f16.gguf" (
    echo [OK] Wave 3: models\vad\earshot-vad-f16.gguf
) else (
    echo [MISSING] Wave 3: models\vad\earshot-vad-f16.gguf
    set /a MISSING+=1
)

echo.
if !MISSING! equ 0 (
    echo All requested models are present and ready!
) else (
    echo Note: !MISSING! model file^(s^) are not present. Run this script again to download them.
)

echo.
echo Next steps:
echo   1. If using Audio.cpp server, make sure audiocpp_server.exe is in "%TARGET_DIR%".
echo   2. Start backends by running "Start Backends.bat".
echo   3. In EllipsisProse Settings, select Audio Drama backend: "Audio.cpp (Local Hybrid Studio)".
echo.

:done
if "%NON_INTERACTIVE%"=="1" (
    endlocal
    exit /b 0
)
echo Press any key to exit...
pause >nul
endlocal
