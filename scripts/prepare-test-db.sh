#!/usr/bin/env bash
set -euo pipefail

CONTAINER="sishi-zichan-test-mysql"
PORT="3307"

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  :
elif docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker start "$CONTAINER" >/dev/null
else
  docker run -d \
    --name "$CONTAINER" \
    -p "${PORT}:3306" \
    -e MARIADB_ROOT_PASSWORD=root \
    -e MARIADB_DATABASE=sishi \
    mariadb:11 \
    --character-set-server=utf8mb4 \
    --collation-server=utf8mb4_unicode_ci \
    >/dev/null
fi

echo "Waiting for MariaDB ($CONTAINER)..."
for _ in $(seq 1 90); do
  if docker exec "$CONTAINER" mariadb-admin ping -uroot -proot --silent 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! docker exec "$CONTAINER" mariadb-admin ping -uroot -proot --silent 2>/dev/null; then
  echo "MariaDB did not become ready in time." >&2
  exit 1
fi

export DATABASE_URL="mysql://root:root@127.0.0.1:${PORT}/sishi"
cd "$(dirname "$0")/.."
npx prisma db push --skip-generate
