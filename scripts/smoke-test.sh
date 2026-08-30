#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local expect="$2"
  local url="$3"
  shift 3
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$@" "$url")
  if [ "$code" = "$expect" ]; then
    echo "OK  $name ($code)"
    PASS=$((PASS + 1))
  else
    echo "FAIL $name (expected $expect, got $code)"
    FAIL=$((FAIL + 1))
  fi
}

check_json_ok() {
  local name="$1"
  local url="$2"
  shift 2
  local body
  body=$(curl -s "$@" "$url")
  if echo "$body" | grep -q '"ok":true'; then
    echo "OK  $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test @ $BASE ==="

check "homepage" 200 "$BASE/"
check "mobile" 200 "$BASE/m"
check "admin login page" 200 "$BASE/admin/login"
check "register" 200 "$BASE/m/register"
check "favicon" 200 "$BASE/icon"

ADMIN_COOKIE=/tmp/smoke_admin_cookies.txt
rm -f "$ADMIN_COOKIE"
check_json_ok "admin login" "$BASE/api/auth/admin/login" \
  -c "$ADMIN_COOKIE" -X POST -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}'

check "admin dashboard" 200 "$BASE/admin" -b "$ADMIN_COOKIE"
check "admin assets" 200 "$BASE/admin/assets" -b "$ADMIN_COOKIE"
check "admin auctions" 200 "$BASE/admin/auctions" -b "$ADMIN_COOKIE"
check "admin drying" 200 "$BASE/admin/drying" -b "$ADMIN_COOKIE"
check "admin dict" 200 "$BASE/admin/dict" -b "$ADMIN_COOKIE"

USER_COOKIE=/tmp/smoke_user_cookies.txt
rm -f "$USER_COOKIE"
check_json_ok "user login" "$BASE/api/auth/login" \
  -c "$USER_COOKIE" -X POST -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}'

check "auction list" 200 "$BASE/m/auction" -b "$USER_COOKIE"
check "drying list" 200 "$BASE/m/drying" -b "$USER_COOKIE"
check "user profile" 200 "$BASE/m/me" -b "$USER_COOKIE"
check "orders" 200 "$BASE/m/orders" -b "$USER_COOKIE"

TOKEN_BODY=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test")
if echo "$TOKEN_BODY" | grep -q '"token"'; then
  echo "OK  third-party token"
  PASS=$((PASS + 1))
else
  echo "FAIL third-party token: $TOKEN_BODY"
  FAIL=$((FAIL + 1))
fi

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
