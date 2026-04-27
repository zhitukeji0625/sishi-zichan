#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEFAULT_DATABASE_URL="mysql://root:root@127.0.0.1:${MYSQL_PORT:-33306}/sishi"

run_vitest() {
  exec npx vitest run "$@"
}

if [[ -n "${DATABASE_URL:-}" ]]; then
  run_vitest "$@"
fi

export DATABASE_URL="$DEFAULT_DATABASE_URL"

if ! command -v docker >/dev/null 2>&1; then
  echo "未设置 DATABASE_URL 且未找到 docker，无法运行依赖数据库的测试。" >&2
  echo "请设置 DATABASE_URL 或安装并启动 Docker 后重试。" >&2
  exit 1
fi

docker compose up -d mysql

echo "等待 MySQL 就绪（DATABASE_URL=${DATABASE_URL}）..."
for _ in $(seq 1 90); do
  if docker compose exec -T mysql mariadb -uroot -proot -e "SELECT 1" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker compose exec -T mysql mariadb -uroot -proot -e "SELECT 1" >/dev/null 2>&1; then
  echo "MySQL 在预期时间内未就绪。" >&2
  exit 1
fi

npx prisma db push --skip-generate
run_vitest "$@"
