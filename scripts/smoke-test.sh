#!/usr/bin/env bash
# API smoke tests — requires dev server at BASE_URL
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name (HTTP $actual)"
  else fail "$name (expected $expected, got $actual)"; fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then pass "$name"
  else fail "$name — $body"; fi
}

echo "=== Smoke Tests @ $BASE_URL ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
assert_status "GET /" "200" "$code"

# 2. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/admin/login")
assert_status "GET /admin/login" "200" "$code"

# 3. Mobile login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/m/login")
assert_status "GET /m/login" "200" "$code"

# 4. Mobile home
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/m")
assert_status "GET /m" "200" "$code"

# 5. Auction list
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/m/auction")
assert_status "GET /m/auction" "200" "$code"

# 6. Drying list
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/m/drying")
assert_status "GET /m/drying" "200" "$code"

# 7. Admin login API
body=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE_URL/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "POST /api/auth/admin/login" "$body"

# 8. Admin dashboard (with cookie)
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE_URL/admin")
assert_status "GET /admin (authenticated)" "200" "$code"

# 9. Upload without multipart → 400
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/upload" \
  -H "Content-Type: application/json" \
  -d '{"file":"test"}')
assert_status "POST /api/upload (non-multipart)" "400" "$code"

# 10. Assets without multipart → 400
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/admin/assets" \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}')
assert_status "POST /api/admin/assets (non-multipart)" "400" "$code"

# 11. Admin logout
body=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE_URL/api/auth/admin/logout")
assert_json_ok "POST /api/auth/admin/logout" "$body"

# 12. User login
USER_COOKIE=$(mktemp)
body=$(curl -s -c "$USER_COOKIE" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "POST /api/auth/login" "$body"

# 13. Bid without auth → 401
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/m/auction/fake-id/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":8000}')
assert_status "POST /api/m/auction/bid (no auth)" "401" "$code"

# 14. Get LIVE project and bid
BID_INFO=$(cd /workspace && npx tsx scripts/smoke-db-query.ts live-project 2>/dev/null || true)
PROJECT_ID=$(echo "$BID_INFO" | cut -f1)
MIN_BID=$(echo "$BID_INFO" | cut -f2)

if [ -n "$PROJECT_ID" ] && [ -n "$MIN_BID" ]; then
  body=$(curl -s -b "$USER_COOKIE" -X POST "$BASE_URL/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  assert_json_ok "POST /api/m/auction/$PROJECT_ID/bid (amount=$MIN_BID)" "$body"
else
  fail "No LIVE auction project found for bid test"
fi

# 15. Drying reserve
LISTING_ID=$(cd /workspace && npx tsx scripts/smoke-db-query.ts drying-listing 2>/dev/null || true)

if [ -n "$LISTING_ID" ]; then
  START_DATE=$(date -d "+10 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -v+10d +%Y-%m-%dT00:00:00.000Z)
  END_DATE=$(date -d "+11 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -v+11d +%Y-%m-%dT00:00:00.000Z)
  body=$(curl -s -b "$USER_COOKIE" -X POST "$BASE_URL/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  assert_json_ok "POST /api/m/drying/reserve" "$body"
else
  fail "No OPERATING drying listing found"
fi

# 16. Register new user
PHONE="199$(date +%s | tail -c 9)"
body=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
assert_json_ok "POST /api/auth/register ($PHONE)" "$body"

# 17. Register duplicate → 409
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\"}")
assert_status "POST /api/auth/register (duplicate)" "409" "$code"

# 18. Third-party token (dev)
body=$(curl -s "$BASE_URL/api/dev/third-party-token?u_id=smoke_test_user")
if echo "$body" | grep -q '"token"'; then pass "GET /api/dev/third-party-token"
else fail "GET /api/dev/third-party-token — $body"; fi

# 19. Invalid login → 401
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrongpassword"}')
assert_status "POST /api/auth/login (wrong password)" "401" "$code"

# 20. User logout
body=$(curl -s -b "$USER_COOKIE" -X POST "$BASE_URL/api/auth/logout")
assert_json_ok "POST /api/auth/logout" "$body"

# 21. Admin assets page
ADMIN_COOKIE=$(mktemp)
curl -s -c "$ADMIN_COOKIE" -X POST "$BASE_URL/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' > /dev/null
code=$(curl -s -b "$ADMIN_COOKIE" -o /dev/null -w "%{http_code}" "$BASE_URL/admin/assets")
assert_status "GET /admin/assets" "200" "$code"

rm -f "$USER_COOKIE" "$ADMIN_COOKIE"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
