#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.test.yml)

cleanup() {
  docker compose "${COMPOSE_FILES[@]}" down -v 2>/dev/null || true
}
trap cleanup EXIT

if [[ -n "${DATABASE_URL:-}" ]] && [[ "${FORCE_DOCKER_TEST:-}" != "1" ]]; then
  echo "Using existing DATABASE_URL for tests."
  npx vitest run
  trap - EXIT
  exit 0
fi

echo "Starting test database (MariaDB on localhost:3307)..."
docker compose "${COMPOSE_FILES[@]}" up -d --wait mysql

set -a
# shellcheck disable=SC1091
source .env.test
set +a

echo "Applying Prisma schema..."
npx prisma db push --accept-data-loss

echo "Running Vitest..."
npx vitest run

echo "Tests finished."
