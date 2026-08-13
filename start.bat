@echo off
setlocal
cd /d "%~dp0"
title Trading Bot - Paper Mode

if not exist .env (
  echo .env not found. Creating it from .env.example...
  copy /Y .env.example .env >nul
)

if not exist node_modules (
  echo Dependencies are not installed. Running install.bat first...
  call install.bat
  if errorlevel 1 exit /b 1
)

set AUTO_OPEN_BROWSER=true
call npm start

echo.
echo Trading Bot stopped.
pause
