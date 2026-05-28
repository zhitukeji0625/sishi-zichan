#!/usr/bin/env bash
# 本地/CI 冒烟：需已启动 MariaDB、db push/seed 与 dev 或 start 服务
set -euo pipefail
BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
COOKIE_USER="${TMPDIR:-/tmp}/sishi-smoke-user.txt"
COOKIE_ADMIN="${TMPDIR:-/tmp}/sishi-smoke-admin.txt"
FAIL=0

check() {
  local name="$1" code="$2" expect="$3"
  if [ "$code" != "$expect" ]; then
    echo "FAIL $name: expected HTTP $expect, got $code"
    FAIL=1
  else
    echo "OK $name ($code)"
  fi
}

for path in / /m /m/login /admin/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "$code" "200"
done

code=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_USER" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check "POST user login" "$code" "200"

code=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_ADMIN" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check "POST admin login" "$code" "200"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_ADMIN" "$BASE/admin/assets")
check "GET /admin/assets" "$code" "200"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_USER" "$BASE/m/me")
check "GET /m/me" "$code" "200"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
check "GET dev third-party-token" "$code" "200"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')
check "POST bad login" "$code" "401"

exit "$FAIL"
