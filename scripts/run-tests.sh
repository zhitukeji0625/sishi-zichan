#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="${DATABASE_URL:-mysql://root:root@127.0.0.1:3307/sishi_test}"

docker compose -f docker-compose.test.yml up -d

echo "Waiting for MySQL..."
for _ in $(seq 1 90); do
  if docker compose -f docker-compose.test.yml exec -T mysql \
    mariadb-admin ping -h127.0.0.1 -uroot -proot --silent 2>/dev/null; then
    break
  fi
  sleep 2
done

npx prisma db push --accept-data-loss
npx vitest run

docker compose -f docker-compose.test.yml down -v
