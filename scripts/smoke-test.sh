#!/usr/bin/env bash
# 功能冒烟测试：单元测试 + 关键 HTTP 接口（需 dev 或 start 服务在 3000 端口）
set -euo pipefail
cd "$(dirname "$0")/.."

export VITEST_REQUIRE_DB="${VITEST_REQUIRE_DB:-1}"
echo "==> Vitest (VITEST_REQUIRE_DB=$VITEST_REQUIRE_DB)"
npm run test

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
echo "==> HTTP smoke against $BASE"

wait_ready() {
  for _ in $(seq 1 30); do
    if curl -sf -o /dev/null "$BASE/"; then return 0; fi
    sleep 2
  done
  echo "Server not ready at $BASE" >&2
  exit 1
}
wait_ready

COOKIE_USER="/tmp/smoke-user.txt"
COOKIE_ADMIN="/tmp/smoke-admin.txt"
rm -f "$COOKIE_USER" "$COOKIE_ADMIN"

fail=0
assert_code() {
  local name="$1" want="$2" got="$3"
  if [ "$got" != "$want" ]; then
    echo "FAIL $name: want $want got $got" >&2
    fail=$((fail + 1))
  else
    echo "OK   $name"
  fi
}

for path in / /m/login /admin/login; do
  c=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_code "GET $path" 200 "$c"
done

c=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_USER" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_code "POST /api/auth/login" 200 "$c"

c=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_ADMIN" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_code "POST /api/auth/admin/login" 200 "$c"

c=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_ADMIN" "$BASE/admin/assets")
assert_code "GET /admin/assets" 200 "$c"

c=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_USER" "$BASE/m/me")
assert_code "GET /m/me" 200 "$c"

c=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/invalid/bid" \
  -H "Content-Type: application/json" -d '{"amount":1}')
assert_code "POST bid unauthenticated" 401 "$c"

if [ "$fail" -gt 0 ]; then
  echo "Smoke test failed: $fail error(s)" >&2
  exit 1
fi
echo "Smoke test passed."
