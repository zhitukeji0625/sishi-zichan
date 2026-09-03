#!/usr/bin/env bash
# 功能完整性冒烟测试 — 须从仓库根目录运行: npm run test:smoke
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/smoke-admin-cookies.txt"
USER_JAR="/tmp/smoke-user-cookies.txt"
rm -f "$COOKIE_JAR" "$USER_JAR"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

# Public pages
check "homepage" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "admin login page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "m home" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "m login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "favicon" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/favicon.svg")"

# Admin login
ADMIN_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ADMIN_RESP" | grep -qE 'ok|success|admin'; then
  echo "✓ admin login API"
  PASS=$((PASS+1))
else
  echo "✗ admin login API: $ADMIN_RESP"
  FAIL=$((FAIL+1))
fi

# Admin protected pages
check "admin dashboard" "200" "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin")"
check "admin assets" "200" "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin/assets")"
check "admin auctions" "200" "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin/auctions")"
check "admin dict" "200" "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin/dict")"
check "admin drying" "200" "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin/drying")"

# User login
USER_RESP=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$USER_RESP" | grep -qE 'ok|success|user'; then
  echo "✓ user login API"
  PASS=$((PASS+1))
else
  echo "✗ user login API: $USER_RESP"
  FAIL=$((FAIL+1))
fi

# Mobile pages with auth
check "m me" "200" "$(curl -s -b "$USER_JAR" -o /dev/null -w '%{http_code}' "$BASE/m/me")"
check "m auction" "200" "$(curl -s -b "$USER_JAR" -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check "m drying" "200" "$(curl -s -b "$USER_JAR" -o /dev/null -w '%{http_code}' "$BASE/m/drying")"
check "m orders" "200" "$(curl -s -b "$USER_JAR" -o /dev/null -w '%{http_code}' "$BASE/m/orders")"

# Third-party token (dev only)
TP_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test")
if echo "$TP_RESP" | grep -q 'token'; then
  echo "✓ third-party token API"
  PASS=$((PASS+1))
else
  echo "✗ third-party token API: $TP_RESP"
  FAIL=$((FAIL+1))
fi

# Upload without multipart should return 400
check "upload non-multipart" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload")"

# Dict count in DB
DICT_COUNT=$(npx tsx scripts/dict-count.ts 2>/dev/null)
if [ "$DICT_COUNT" = "14" ]; then
  echo "✓ dict categories count ($DICT_COUNT)"
  PASS=$((PASS+1))
else
  echo "✗ dict categories count (expected 14, got $DICT_COUNT)"
  FAIL=$((FAIL+1))
fi

# Unauthenticated admin redirect
check "admin without auth" "307" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")"

echo ""
echo "Results: $PASS passed, $FAIL failed"
exit "$FAIL"
