#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/sishi-smoke-cookies.txt"
ADMIN_JAR="/tmp/sishi-smoke-admin-cookies.txt"
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $name (expected HTTP $expected, got $actual)"
    FAIL=$((FAIL + 1))
  else
    echo "OK: $name ($actual)"
  fi
}

echo "=== Smoke tests against $BASE ==="

# Public pages
for path in "/" "/m" "/m/login" "/m/register" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# User login
rm -f "$COOKIE_JAR"
code=$(curl -s -o /tmp/login-res.json -w "%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check "POST /api/auth/login" "200" "$code"
grep -q '"ok":true' /tmp/login-res.json || { echo "FAIL: user login body"; FAIL=$((FAIL+1)); }

# User protected page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/me")
check "GET /m/me (logged in)" "200" "$code"

# Admin login
rm -f "$ADMIN_JAR"
code=$(curl -s -o /tmp/admin-login-res.json -w "%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check "POST /api/auth/admin/login" "200" "$code"
grep -q '"ok":true' /tmp/admin-login-res.json || { echo "FAIL: admin login body"; FAIL=$((FAIL+1)); }

# Admin pages
for path in "/admin" "/admin/assets" "/admin/auctions"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  check "GET $path (admin)" "200" "$code"
done

# Admin API - create assets is POST-only
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/api/admin/assets")
check "GET /api/admin/assets (POST-only)" "405" "$code"

# Dev third-party token (GET)
code=$(curl -s -o /tmp/tpt.json -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke-test")
check "GET /api/dev/third-party-token" "200" "$code"

# Unauthenticated admin should redirect or 401
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
if [ "$code" != "307" ] && [ "$code" != "302" ] && [ "$code" != "401" ]; then
  echo "FAIL: unauthenticated /admin/assets (expected redirect/401, got $code)"
  FAIL=$((FAIL + 1))
else
  echo "OK: unauthenticated /admin/assets ($code)"
fi

# Invalid login
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
check "POST /api/auth/login (bad password)" "401" "$code"

# Mobile auction list
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")
check "GET /m/auction" "200" "$code"

echo "=== Done: $FAIL failure(s) ==="
exit $FAIL
