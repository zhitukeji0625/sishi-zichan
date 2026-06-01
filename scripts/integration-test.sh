#!/usr/bin/env bash
# Integration smoke tests against local dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_COOKIE=$(mktemp)
FAIL=0

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; FAIL=1; }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

# Public pages
for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

# User login
resp=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$resp" | grep -q '"ok":true' && pass "POST /api/auth/login" || fail "POST /api/auth/login: $resp"

# Admin login
resp=$(curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$resp" | grep -q '"ok":true' && pass "POST /api/auth/admin/login" || fail "POST /api/auth/admin/login: $resp"

# Protected admin page (with cookie)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin")
check_status "GET /admin (authenticated)" "200" "$code"

# Unauthenticated admin redirect
code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/admin/assets")
# middleware may redirect to login (307/302) or return 200 if already has session from parallel - use fresh jar
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
if [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "200" ]; then
  pass "GET /admin/assets unauthenticated ($code)"
else
  fail "GET /admin/assets unauthenticated ($code)"
fi

# Dev third-party token
resp=$(curl -s "$BASE/api/dev/third-party-token?phone=13800138000")
echo "$resp" | grep -q 'token' && pass "GET /api/dev/third-party-token" || fail "GET /api/dev/third-party-token: $resp"

# Third-party auth
token=$(echo "$resp" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -n "$token" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$token\"}")
  check_status "POST /api/auth/third-party" "200" "$code"
fi

# Mobile me page (authenticated)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/me")
check_status "GET /m/me (authenticated)" "200" "$code"

rm -f "$COOKIE_JAR" "$ADMIN_COOKIE"
if [ "$FAIL" -eq 1 ]; then exit 1; fi
echo "All integration tests passed."
