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
    FAIL=$((FAIL + 1))
  else
    echo "OK: $name ($actual)"
  fi
}

check_json() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -qE "$pattern"; then
    echo "OK: $name"
  else
    echo "FAIL: $name (body missing pattern: $pattern)"
    echo "  body: ${body:0:200}"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Public pages ==="
check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /m/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

echo "=== User auth ==="
LOGIN_BODY=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
check_json "POST /api/auth/login" '"ok":true|"success":true' "$LOGIN_BODY"

check "GET /m/me (authenticated)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/me")"
check "GET /m/auction" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/auction")"
check "GET /m/orders" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/orders")"
check "GET /m/drying" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/drying")"

echo "=== Admin auth ==="
ADMIN_BODY=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json "POST /api/auth/admin/login" '"ok":true|"success":true' "$ADMIN_BODY"

check "GET /admin" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin")"
check "GET /admin/assets" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin/assets")"
check "GET /admin/auctions" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin/auctions")"

echo "=== Third-party SSO (dev) ==="
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
check_json "GET /api/dev/third-party-token" 'token' "$TOKEN_RESP"
TOKEN=$(echo "$TOKEN_RESP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [[ -n "$TOKEN" ]]; then
  SSO_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/sso?token=$TOKEN")
  check "GET /m/sso?token=..." 200 "$SSO_CODE"
else
  echo "FAIL: could not parse third-party token"
  FAIL=$((FAIL + 1))
fi

echo "=== Protected without auth ==="
NO_AUTH_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")
check "GET /admin (no cookie)" 307 "$NO_AUTH_CODE"

echo "=== Logout ==="
curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout" >/dev/null
curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout" >/dev/null
check "POST /api/auth/logout" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")"

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "All smoke tests passed."
  exit 0
else
  echo "$FAIL test(s) failed."
  exit 1
fi
