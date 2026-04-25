#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for npm test (integration tests use MariaDB)." >&2
  exit 1
fi

COMPOSE=(docker compose -f docker-compose.test.yml)

echo "Starting test database..."
"${COMPOSE[@]}" up -d --wait mysql

set -a
# shellcheck source=/dev/null
source .env.test
set +a

npx prisma db push

exec npx vitest run
