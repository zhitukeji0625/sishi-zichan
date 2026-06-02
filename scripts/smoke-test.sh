#!/usr/bin/env bash
# Functional smoke tests against local dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: $name (expected HTTP $expected, got $actual)"
    FAIL=1
  else
    echo "OK: $name ($actual)"
  fi
}

check_contains() {
  local name="$1" needle="$2" body="$3"
  if echo "$body" | grep -q "$needle"; then
    echo "OK: $name"
  else
    echo "FAIL: $name (missing: $needle)"
    FAIL=1
  fi
}

echo "=== Public pages ==="
check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /m/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

echo "=== User auth ==="
LOGIN_RESP=$(curl -s -w '\n%{http_code}' -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
LOGIN_CODE=$(echo "$LOGIN_RESP" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_RESP" | sed '$d')
check "POST /api/auth/login" 200 "$LOGIN_CODE"
check_contains "login response" '"ok":true' "$LOGIN_BODY"

check "GET /m/me (authed)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/me")"

echo "=== Admin auth ==="
ADMIN_RESP=$(curl -s -w '\n%{http_code}' -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_RESP" | tail -1)
ADMIN_BODY=$(echo "$ADMIN_RESP" | sed '$d')
check "POST /api/auth/admin/login" 200 "$ADMIN_CODE"
check_contains "admin login" '"ok":true' "$ADMIN_BODY"

check "GET /admin (authed)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin")"
check "GET /admin/assets" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin/assets")"
check "GET /admin/auctions" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin/auctions")"

echo "=== Mobile auction pages ==="
check "GET /m/auction" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/auction")"

echo "=== Third-party dev token ==="
TP_RESP=$(curl -s -w '\n%{http_code}' "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
TP_CODE=$(echo "$TP_RESP" | tail -1)
TP_BODY=$(echo "$TP_RESP" | sed '$d')
check "GET /api/dev/third-party-token" 200 "$TP_CODE"
check_contains "third-party token" 'token' "$TP_BODY"

echo "=== Protected API without auth ==="
check "POST bid without auth" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/fake-id/bid" \
  -H 'Content-Type: application/json' -d '{"amount":100}')"

echo "=== Logout ==="
check "POST /api/auth/logout" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")"

if [[ "$FAIL" -ne 0 ]]; then
  echo "=== SMOKE TESTS FAILED ==="
  exit 1
fi
echo "=== ALL SMOKE TESTS PASSED ==="
