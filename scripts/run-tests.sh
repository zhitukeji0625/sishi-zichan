#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

docker compose -f docker-compose.test.yml up -d --wait

cleanup() {
  docker compose -f docker-compose.test.yml down -v
}
trap cleanup EXIT

export RUN_DB_INTEGRATION=1
set -a
# shellcheck disable=SC1091
source .env.test
set +a

npx prisma db push
npx vitest run
