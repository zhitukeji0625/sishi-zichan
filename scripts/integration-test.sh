#!/bin/bash
# Integration smoke tests for key API flows
set -euo pipefail
BASE="http://localhost:3000"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $name (expected HTTP $expected, got $actual)"
    FAIL=$((FAIL + 1))
  else
    echo "OK: $name"
  fi
}

# Public pages
check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

# User login
LOGIN_RESP=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
LOGIN_CODE=$(echo "$LOGIN_RESP" | tail -1)
check "POST /api/auth/login" 200 "$LOGIN_CODE"

# Admin login
ADMIN_RESP=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_RESP" | tail -1)
check "POST /api/auth/admin/login" 200 "$ADMIN_CODE"

# Protected admin route without cookie (redirect to login)
ADMIN_NO_COOKIE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")
if [ "$ADMIN_NO_COOKIE" = "307" ] || [ "$ADMIN_NO_COOKIE" = "302" ]; then
  echo "OK: GET /admin (no cookie -> redirect)"
else
  echo "FAIL: GET /admin (no cookie) (expected redirect, got $ADMIN_NO_COOKIE)"
  FAIL=$((FAIL + 1))
fi

# Protected admin with cookie
check "GET /admin (with cookie)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin")"

# Dev third-party token
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-user-001")
if echo "$TOKEN_RESP" | grep -q '"token"'; then
  echo "OK: GET /api/dev/third-party-token"
else
  echo "FAIL: GET /api/dev/third-party-token (no token in response)"
  FAIL=$((FAIL + 1))
fi

# Third-party SSO login
TOKEN=$(echo "$TOKEN_RESP" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
  SSO_CODE=$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  check "POST /api/auth/third-party" 200 "$SSO_CODE"
fi

# Auction list page (logged in user)
check "GET /m/auction" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/auction")"

# Invalid login
BAD_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
if [ "$BAD_CODE" = "401" ] || [ "$BAD_CODE" = "400" ]; then
  echo "OK: POST /api/auth/login (bad password -> $BAD_CODE)"
else
  echo "FAIL: POST /api/auth/login bad password (got $BAD_CODE)"
  FAIL=$((FAIL + 1))
fi

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "$FAIL test(s) failed"
  exit 1
fi
echo ""
echo "All integration tests passed"
