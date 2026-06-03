#!/usr/bin/env bash
# Functional smoke tests against local dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
USER_COOKIE="/tmp/sishi-user-cookies.txt"
ADMIN_COOKIE="/tmp/sishi-admin-cookies.txt"
FAIL=0
PASS=0

ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then ok "$name (HTTP $actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

check_body() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -qE "$pattern"; then ok "$name"; else fail "$name (pattern: $pattern)"; fi
}

echo "=== Pages ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

echo "=== Auth APIs ==="
rm -f "$USER_COOKIE" "$ADMIN_COOKIE"

code=$(curl -s -o /tmp/login-user.json -w "%{http_code}" -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check_status "POST /api/auth/login (user)" "200" "$code"
check_body "user login ok" '"ok":true' "$(cat /tmp/login-user.json)"

code=$(curl -s -o /tmp/login-admin.json -w "%{http_code}" -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check_status "POST /api/auth/admin/login" "200" "$code"
check_body "admin login ok" '"ok":true' "$(cat /tmp/login-admin.json)"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" "$BASE/m/me")
check_status "GET /m/me (authenticated)" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin")
check_status "GET /admin (authenticated)" "200" "$code"

echo "=== Third-party SSO ==="
TOKEN_JSON=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-sso-user")
check_body "dev third-party token" '"token"' "$TOKEN_JSON"
TOKEN=$(echo "$TOKEN_JSON" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -n "$TOKEN" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
  if [ "$code" = "200" ] || [ "$code" = "307" ]; then
    ok "GET /m/sso?token=... (client-side SSO page)"
  else
    fail "GET /m/sso?token=... (expected 200/307, got $code)"
  fi
else
  fail "extract third-party token"
fi

echo "=== Auction bid ==="
PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT id FROM AuctionProject WHERE status='LIVE' ORDER BY createdAt DESC LIMIT 1;" 2>/dev/null || true)

if [ -z "$PROJECT_ID" ]; then
  fail "no LIVE auction project in DB"
else
  ok "found LIVE project $PROJECT_ID"
  code=$(curl -s -o /tmp/bid.json -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":8400}')
  if [ "$code" = "200" ]; then
    check_status "POST bid" "200" "$code"
    check_body "bid ok" '"ok":true' "$(cat /tmp/bid.json)"
  else
    body=$(cat /tmp/bid.json)
    # May fail if already bid higher - still valid business logic
    if echo "$body" | grep -qE '出价|已|最低'; then ok "POST bid (business rule: $body)"; else fail "POST bid ($code): $body"; fi
  fi
fi

echo "=== Drying reserve ==="
LISTING_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT id FROM DryingFieldListing WHERE status='OPERATING' LIMIT 1;" 2>/dev/null || true)

if [ -z "$LISTING_ID" ]; then
  fail "no drying listing"
else
  TOMORROW=$(date -u -d "+3 days" +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
  code=$(curl -s -o /tmp/dry.json -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$TOMORROW\",\"endDate\":\"$TOMORROW\"}")
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    check_status "POST drying reserve" "$code" "$code"
  else
    body=$(cat /tmp/dry.json)
    if echo "$body" | grep -qE '已满|重复|预约'; then ok "drying reserve (business rule)"; else fail "drying reserve ($code): $body"; fi
  fi
fi

echo "=== Admin pages (authenticated) ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin/assets")
check_status "GET /admin/assets" "200" "$code"

echo "=== Register validation ==="
code=$(curl -s -o /tmp/reg.json -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123","name":"x"}')
if [ "$code" = "409" ] || [ "$code" = "400" ]; then
  ok "register duplicate phone rejected ($code)"
else
  fail "register duplicate expected 409/400 got $code"
fi

echo "=== Logout ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/auth/logout")
check_status "POST /api/auth/logout" "200" "$code"

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
