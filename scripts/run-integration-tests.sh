#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env.test ]]; then
  echo "run-integration-tests: missing .env.test" >&2
  exit 1
fi

# shellcheck source=/dev/null
set -a && source .env.test && set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "run-integration-tests: DATABASE_URL not set in .env.test" >&2
  exit 1
fi

docker compose -f docker-compose.test.yml up -d --wait
npx prisma db push --skip-generate

export SISHI_TEST_DB=1
npx vitest run src/lib/__tests__/auction.test.ts
