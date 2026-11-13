#!/usr/bin/env bash
# Prueba completa: base nueva + app compilada + pruebas de la API.
# Uso: DATABASE_URL=postgres://... bash scripts/e2e.sh   (¡BORRA esa base!)
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?Falta DATABASE_URL (usá una base de PRUEBA, se borra)}"
PORT="${PORT:-3200}"
export ADMIN_PASSWORD=admin-test-123 OWNER_PASSWORD=bunker-test MAURI_CODE=1234 IVAN_CODE=5678
export ALLOW_TEST_CLOCK=1 TEST_NOW="2026-11-13T11:00:00-03:00"

node scripts/db.mjs reset --yes
node scripts/db.mjs seed
[ -d .next ] || npx next build
if curl -s -o /dev/null "http://localhost:$PORT"; then echo "El puerto $PORT está ocupado" >&2; exit 1; fi
setsid ./node_modules/.bin/next start -p "$PORT" > /tmp/bunker-e2e.log 2>&1 &
SERVER=$!
trap 'kill -- -$SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/api/public/live" >/dev/null && break; sleep 1; done
TEST_BASE_URL="http://localhost:$PORT" node --test tests/api.test.mjs
