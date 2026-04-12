#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose -f docker-compose.test.yml up -d --wait
set -a
# shellcheck source=/dev/null
source .env.test
export RUN_DB_TESTS=true
set +a
npx prisma db push
npx vitest run
