@echo off
setlocal
cd /d "%~dp0"
title Trading Bot - Installation

echo.
echo ========================================
echo  Trading Bot - Windows installation
echo ========================================
echo.

where node >nul 2>nul || goto :node_missing
node -e "const m=Number(process.versions.node.split('.')[0]);process.exit(m>=20&&m<25?0:1)" || goto :node_wrong

echo [1/3] Node.js found:
node --version

echo.
echo [2/3] Installing dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 goto :failed

if not exist .env (
  echo.
  echo [3/3] Creating default configuration .env...
  copy /Y .env.example .env >nul
) else (
  echo.
  echo [3/3] Existing .env kept unchanged.
)

call npm run check
if errorlevel 1 goto :failed

echo.
echo ========================================
echo  Installation completed successfully.
echo  Double-click start.bat to launch.
echo  The dashboard will open in your browser.
echo ========================================
echo.
pause
exit /b 0

:node_missing
echo ERROR: Node.js is not installed.
echo Install Node.js 20-24 from https://nodejs.org/ and run install.bat again.
goto :failed_pause

:node_wrong
echo ERROR: Node.js 20-24 is supported. Current version:
node --version
goto :failed_pause

:failed
echo.
echo ERROR: Installation or self-check failed.
:failed_pause
echo Copy the error above when asking for help.
echo.
pause
exit /b 1
