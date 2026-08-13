@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (
  echo ERROR: Node.js 20-22 is required.
  exit /b 1
)

node -e "const m=Number(process.versions.node.split('.')[0]);process.exit(m>=20&&m<24?0:1)" || (
  echo ERROR: Node.js 20-22 is required.
  exit /b 1
)

call npm install --no-audit --no-fund || exit /b 1
if not exist .env copy /Y .env.example .env >nul
call npm run check || exit /b 1

echo Installation complete. Run start.bat.
