@echo off
title Earth Trend Detective — Backend (FastAPI)
echo.
echo  =========================================
echo   Earth Trend Detective — Backend
echo   FastAPI + Uvicorn on http://127.0.0.1:8000
echo  =========================================
echo.

cd /d "%~dp0backend"

:: Check Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Make sure Python 3.9+ is installed and on PATH.
    pause
    exit /b 1
)

:: Install / verify dependencies
echo [1/2] Checking dependencies...
python -m pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [ERROR] Dependency installation failed. See output above.
    pause
    exit /b 1
)

echo [2/2] Starting Uvicorn...
echo.
echo  API docs available at: http://127.0.0.1:8000/docs
echo  Press Ctrl+C to stop.
echo.

python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

pause
