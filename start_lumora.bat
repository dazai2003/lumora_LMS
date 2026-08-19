@echo off
title Lumora LMS Launcher
color 0b

echo ========================================================
echo        LUMORA A/L LMS - 1-CLICK SYSTEM STARTUP
echo ========================================================
echo.

:: 1. Navigate to Project Root
cd /d "%~dp0"

echo [1/4] Checking and freeing server ports (8000 and 3000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [2/4] Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "Lumora Backend (Port 8000)" cmd /k "cd /d "%~dp0backend" && .\venv\Scripts\activate && uvicorn main:app --reload --host 127.0.0.1 --port 8000"

timeout /t 2 >nul

echo [3/4] Starting Next.js Frontend on http://localhost:3000 ...
start "Lumora Frontend (Port 3000)" cmd /k "cd /d "%~dp0frontend" && npm run clean-dev"

echo [4/4] Waiting for services to initialize...
timeout /t 4 >nul

echo.
echo ========================================================
echo  Lumora LMS is ready! Opening http://localhost:3000 ...
echo ========================================================
start http://localhost:3000

exit /b 0
