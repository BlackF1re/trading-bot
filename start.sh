#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env
[ -d node_modules ] || ./install.sh
exec npm start
