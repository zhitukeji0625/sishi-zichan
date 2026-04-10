#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="docker-compose.test.yml"
DEFAULT_URL="mysql://root:root@127.0.0.1:3307/sishi"
STARTED_DOCKER=0

if [[ -z "${DATABASE_URL:-}" ]]; then
  export DATABASE_URL="$DEFAULT_URL"
  docker compose -f "$COMPOSE_FILE" up -d --wait
  STARTED_DOCKER=1
  cleanup() {
    docker compose -f "$COMPOSE_FILE" down
  }
  trap cleanup EXIT
fi

npx prisma db push --accept-data-loss
exec npx vitest run "$@"
