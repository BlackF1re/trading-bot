@echo off
setlocal
cd /d "%~dp0"
if not exist .env (
  echo ERROR: .env not found. Run install.bat first.
  exit /b 1
)
call npm start
