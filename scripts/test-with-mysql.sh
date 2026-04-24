#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="docker-compose.test.yml"

cleanup() {
  docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
}
trap cleanup EXIT

docker compose -f "$COMPOSE_FILE" up -d --wait

set -a
# shellcheck source=/dev/null
source "$ROOT/.env.test"
set +a

npx prisma db push --accept-data-loss
npx vitest run
