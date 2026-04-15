#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-mysql://root:root@127.0.0.1:3307/sishi_test}"
export SESSION_SECRET="${SESSION_SECRET:-01234567890123456789012345678901}"
export THIRD_PARTY_JWT_SECRET="${THIRD_PARTY_JWT_SECRET:-01234567890123456789012345678901}"

if ! docker info >/dev/null 2>&1; then
  echo "错误：需要 Docker 才能运行集成测试（Vitest + Prisma）。请启动 Docker 后重试。" >&2
  exit 1
fi

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-sishi_zichan_vitest}"

cleanup() {
  docker compose -f docker-compose.test.yml down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -f docker-compose.test.yml up -d mysql-test

echo "等待测试数据库就绪…"
for _ in $(seq 1 90); do
  if docker compose -f docker-compose.test.yml exec -T mysql-test \
    healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker compose -f docker-compose.test.yml exec -T mysql-test \
  healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; then
  echo "错误：MariaDB 未在预期时间内就绪。" >&2
  exit 1
fi

npx prisma db push --skip-generate
npx vitest run "$@"
