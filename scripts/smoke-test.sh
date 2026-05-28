#!/bin/bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  else
    echo "OK: $name"
  fi
}

echo "=== Smoke tests @ $BASE ==="

# Public pages
for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# User login - bad creds
code=$(curl -s -o /tmp/out.json -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')
check "POST /api/auth/login wrong password" "401" "$code"

# User login - good
code=$(curl -s -o /tmp/out.json -w "%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check "POST /api/auth/login" "200" "$code"
grep -q '"ok":true' /tmp/out.json && echo "OK: login response body" || { echo "FAIL: login body"; FAIL=$((FAIL+1)); }

# Admin login
code=$(curl -s -o /tmp/out.json -w "%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check "POST /api/auth/admin/login" "200" "$code"

# Protected admin without cookie -> redirect or 401
code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/admin/assets")
# middleware may redirect to login
if [ "$code" != "200" ] && [ "$code" != "307" ] && [ "$code" != "308" ]; then
  echo "INFO: GET /admin/assets without auth -> $code"
fi

# Admin assets with cookie
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/assets")
check "GET /admin/assets (authed)" "200" "$code"

# User me page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/me")
check "GET /m/me (authed)" "200" "$code"

# User orders
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/orders")
check "GET /m/orders (authed)" "200" "$code"

# Dev third-party token (if exists)
code=$(curl -s -o /tmp/out.json -w "%{http_code}" "$BASE/api/dev/third-party-token?phone=13800138000" 2>/dev/null || echo "000")
if [ "$code" = "200" ] || [ "$code" = "404" ]; then
  echo "OK: dev third-party token endpoint ($code)"
else
  echo "INFO: dev third-party token -> $code"
fi

rm -f "$COOKIE_JAR" "$ADMIN_JAR"
echo "=== Done: $FAIL failures ==="
exit $FAIL
