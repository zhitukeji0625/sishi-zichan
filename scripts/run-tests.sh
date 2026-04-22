#!/usr/bin/env bash
# 在 DATABASE_URL 未设置时，用 Docker 启动临时 MariaDB，执行 prisma db push 后运行 Vitest。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

INTEGRATION_GLOB="src/lib/__tests__/**/*.integration.test.ts"

if [[ -n "${DATABASE_URL:-}" ]]; then
  exec npx vitest run $INTEGRATION_GLOB "$@"
fi

if ! docker info >/dev/null 2>&1; then
  echo "错误：未设置 DATABASE_URL，且当前环境无法使用 Docker。" >&2
  echo "请设置 DATABASE_URL（例如 .env 中的 MySQL 连接串），或启动 Docker 后重试。" >&2
  exit 1
fi

NAME="sishi-mysql-test-$$"
cleanup() {
  docker stop "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --rm --name "$NAME" \
  -e MARIADB_ROOT_PASSWORD=root \
  -e MARIADB_DATABASE=sishi \
  -p 0:3306 \
  mariadb:11 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci >/dev/null

PORT="$(docker port "$NAME" 3306 | head -1 | awk -F: '{print $NF}')"
export DATABASE_URL="mysql://root:root@127.0.0.1:${PORT}/sishi"

echo "已启动测试用 MariaDB 容器 $NAME，端口 $PORT"

# 等待数据库可连（最多约 2 分钟）
for _ in $(seq 1 60); do
  if docker exec "$NAME" healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

npx prisma db push --skip-generate
exec npx vitest run $INTEGRATION_GLOB "$@"
