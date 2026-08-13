#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 20-24 is required." >&2
  exit 1
fi

major="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$major" -lt 20 ] || [ "$major" -ge 25 ]; then
  echo "ERROR: Node.js 20-24 is supported. Current: $(node --version)" >&2
  exit 1
fi

npm install --no-audit --no-fund
[ -f .env ] || cp .env.example .env
npm run check

echo "Installation complete. Run ./start.sh and open http://127.0.0.1:3000"
