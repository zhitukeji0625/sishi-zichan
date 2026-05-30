#!/usr/bin/env bash
# Smoke test for core API and pages
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; FAIL=$((FAIL+1)); }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

echo "=== Pages ==="
for path in "/" "/m" "/m/login" "/m/register" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

echo "=== User auth ==="
LOGIN=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$LOGIN" | grep -q '"ok":true\|"success":true\|userId\|"id"'; then
  pass "User login"
else
  fail "User login: $LOGIN"
fi

echo "=== Admin auth ==="
ALOGIN=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ALOGIN" | grep -qE '"ok":true|"success":true|adminId|token'; then
  pass "Admin login"
else
  fail "Admin login: $ALOGIN"
fi

echo "=== Authenticated mobile pages ==="
for path in "/m/me" "/m/orders" "/m/auction"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  check_status "GET $path (logged in)" "200" "$code"
done

echo "=== Admin pages ==="
for path in "/admin" "/admin/assets" "/admin/auctions"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  check_status "GET $path (admin)" "200" "$code"
done

echo "=== Dev third-party token (development only) ==="
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-smoke-user")
if echo "$TOKEN_RESP" | grep -q 'token'; then
  pass "Third-party token"
  TOKEN=$(echo "$TOKEN_RESP" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
  SSO_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
  check_status "GET /m/sso" "200" "$SSO_CODE"
elif echo "$TOKEN_RESP" | grep -q '不可用'; then
  pass "Third-party token disabled in production (expected)"
else
  fail "Third-party token: $TOKEN_RESP"
fi

echo "=== Auction bid (demo user) ==="
USER_JAR=$(mktemp)
curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}' > /dev/null
PROJECT_ID=$(curl -s -b "$USER_JAR" "$BASE/m/auction" | grep -oE '/m/auction/c[a-z0-9]{20,}' | head -1 | sed 's|.*/||')
if [ -z "$PROJECT_ID" ]; then
  fail "Could not find auction project id from /m/auction"
else
  BID=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H "Content-Type: application/json" -d '{"amount":999999}')
  if echo "$BID" | grep -q '"ok":true'; then pass "POST bid"; else fail "POST bid: $BID"; fi
fi
rm -f "$USER_JAR"

rm -f "$COOKIE_JAR" "$ADMIN_JAR"
echo ""
if [ "$FAIL" -eq 0 ]; then echo "All smoke tests passed."; exit 0; else echo "$FAIL test(s) failed."; exit 1; fi
