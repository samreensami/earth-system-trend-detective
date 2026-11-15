@echo off
title Earth Trend Detective — Frontend (Next.js)
echo.
echo  =========================================
echo   Earth Trend Detective — Frontend
echo   Next.js dev server on http://localhost:3000
echo  =========================================
echo.

cd /d "%~dp0frontend"

:: Check Node / npm is available
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Make sure Node.js 18+ is installed and on PATH.
    pause
    exit /b 1
)

:: Install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo [1/2] node_modules not found — running npm install...
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. See output above.
        pause
        exit /b 1
    )
) else (
    echo [1/2] node_modules found — skipping install.
)

echo [2/2] Starting Next.js dev server...
echo.
echo  App available at: http://localhost:3000
echo  Backend expected: http://127.0.0.1:8000  (start-backend.bat)
echo  Press Ctrl+C to stop.
echo.

npm run dev

pause
