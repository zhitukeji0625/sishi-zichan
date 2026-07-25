#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"

fail() { echo "FAIL: $1"; exit 1; }

code=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/m/login") || fail "dev server not reachable at $BASE"
[[ "$code" == "200" ]] || fail "/m/login returned $code"

curl -sf -c /tmp/smoke-user.txt -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}' | grep -q '"ok":true' || fail "user login"

curl -sf -c /tmp/smoke-admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}' | grep -q '"ok":true' || fail "admin login"

c=$(curl -s -b /tmp/smoke-user.txt -o /dev/null -w "%{http_code}" "$BASE/m/me")
[[ "$c" == "200" ]] || fail "/m/me returned $c"

c=$(curl -s -b /tmp/smoke-admin.txt -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
[[ "$c" == "200" ]] || fail "/admin/assets returned $c"

echo "smoke-api OK"
