#!/usr/bin/env bash
# 无 DATABASE_URL 时启动临时 MariaDB（Docker），推送 schema 后运行 Vitest。
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" ]]; then
  exec npx vitest run "$@"
fi

if ! docker info >/dev/null 2>&1; then
  echo "未设置 DATABASE_URL 且 Docker 不可用。请复制 .env.example 为 .env 并配置数据库，或安装 Docker 后重试。" >&2
  exit 1
fi

PORT="${TEST_DB_PORT:-13306}"
CONTAINER_NAME="sishi-vitest-mysql-${PORT}-$$"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "启动临时 MariaDB（端口 ${PORT}）…"
docker run -d --name "$CONTAINER_NAME" \
  -e MARIADB_ROOT_PASSWORD=root \
  -e MARIADB_DATABASE=sishi_test \
  -p "${PORT}:3306" \
  mariadb:11 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci \
  >/dev/null

echo "等待数据库就绪…"
for _ in $(seq 1 90); do
  if docker exec "$CONTAINER_NAME" mariadb-admin ping -h localhost -uroot -proot --silent 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! docker exec "$CONTAINER_NAME" mariadb-admin ping -h localhost -uroot -proot --silent 2>/dev/null; then
  echo "MariaDB 在预期时间内未就绪。" >&2
  exit 1
fi

export DATABASE_URL="mysql://root:root@127.0.0.1:${PORT}/sishi_test"
echo "推送 Prisma schema…"
npx prisma db push --accept-data-loss >/dev/null

echo "运行测试…"
exec npx vitest run "$@"
