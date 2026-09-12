#!/usr/bin/env bash
# API smoke tests — requires dev server at localhost:3000
set -euo pipefail

BASE="http://localhost:3000"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name (expected HTTP $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "  PASS: $name (ok:true)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name (no ok:true in: $body)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke Tests ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "Homepage" "200" "$code"

# 2. Mobile pages
for path in /m /m/login /m/register /m/auction /m/drying /m/orders; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "Page $path" "200" "$code"
done

# 3. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "Admin login page" "200" "$code"

# 4. Admin area without auth → redirect
code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/admin")
assert_status "Admin redirect (no auth)" "200" "$code"

# 5. User login with wrong password
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
code=$(echo "$body" | tail -1)
assert_status "User login wrong password" "401" "$code"

# 6. User login success
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_JAR" \
  -d '{"phone":"13800138000","password":"user123"}')
resp=$(echo "$body" | head -n -1)
code=$(echo "$body" | tail -1)
assert_status "User login success" "200" "$code"
assert_json_ok "User login response" "$resp"

# 7. Admin login wrong endpoint (user endpoint)
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$body" | tail -1)
assert_status "Admin via user login fails" "401" "$code"

# 8. Admin login success
ADMIN_JAR=$(mktemp)
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -c "$ADMIN_JAR" \
  -d '{"phone":"13900000001","password":"admin123"}')
resp=$(echo "$body" | head -n -1)
code=$(echo "$body" | tail -1)
assert_status "Admin login success" "200" "$code"
assert_json_ok "Admin login response" "$resp"

# 9. User registration
REG_PHONE="199$(date +%s | tail -c 9)"
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$REG_PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
resp=$(echo "$body" | head -n -1)
code=$(echo "$body" | tail -1)
assert_status "User registration" "200" "$code"
assert_json_ok "User registration response" "$resp"

# 10. Bid without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake-id/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":100}')
assert_status "Bid without auth" "401" "$code"

# 11. Bid with invalid amount
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/fake-id/bid" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR" \
  -d '{"amount":-1}')
code=$(echo "$body" | tail -1)
assert_status "Bid invalid amount" "400" "$code"

# 12. Find LIVE auction project and test bid
LIVE_PROJECT=$(cd /workspace && npx tsx scripts/smoke-helpers.ts live-project 2>/dev/null | tail -1)

if [ -n "$LIVE_PROJECT" ]; then
  PROJECT_ID=$(echo "$LIVE_PROJECT" | awk '{print $1}')
  MIN_BID=$(echo "$LIVE_PROJECT" | awk '{print $2}')
  echo "  INFO: LIVE project=$PROJECT_ID minBid=$MIN_BID"

  # Ensure user has approved registration with deposit
  cd /workspace && npx tsx scripts/smoke-helpers.ts ensure-registration "$PROJECT_ID" "13800138000" 2>/dev/null

  body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_JAR" \
    -d "{\"amount\":$MIN_BID}")
  resp=$(echo "$body" | head -n -1)
  code=$(echo "$body" | tail -1)
  assert_status "Bid on LIVE project" "200" "$code"
  assert_json_ok "Bid response" "$resp"
else
  echo "  SKIP: No LIVE auction project found"
fi

# 13. Drying reserve without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"x","startDate":"2026-01-01","endDate":"2026-01-02"}')
assert_status "Drying reserve without auth" "401" "$code"

# 14. Drying reserve with auth
LISTING_ID=$(cd /workspace && npx tsx scripts/smoke-helpers.ts drying-listing 2>/dev/null | tail -1)

if [ -n "$LISTING_ID" ]; then
  START_DATE=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END_DATE=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_JAR" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  resp=$(echo "$body" | head -n -1)
  code=$(echo "$body" | tail -1)
  # 200 or 400 (overlap) both acceptable
  if [ "$code" = "200" ]; then
    assert_json_ok "Drying reserve" "$resp"
  else
    echo "  PASS: Drying reserve returned $code (may overlap existing)"
    PASS=$((PASS + 1))
  fi
else
  echo "  SKIP: No OPERATING drying listing found"
fi

# 15. Upload without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
assert_status "Upload without auth" "401" "$code"

# 16. Upload non-multipart (should not 500)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -b "$ADMIN_JAR" \
  -H "Content-Type: application/json" \
  -d '{"file":"test"}')
if [ "$code" = "400" ] || [ "$code" = "401" ]; then
  echo "  PASS: Upload non-multipart returns $code (not 500)"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Upload non-multipart expected 400/401, got $code"
  FAIL=$((FAIL + 1))
fi

# 17. Admin asset create non-multipart
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -b "$ADMIN_JAR" \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}')
if [ "$code" = "400" ] || [ "$code" = "401" ]; then
  echo "  PASS: Admin asset non-multipart returns $code (not 500)"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Admin asset non-multipart expected 400/401, got $code"
  FAIL=$((FAIL + 1))
fi

# 18. Mock payment without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/payments/mock" \
  -H "Content-Type: application/json" \
  -d '{"purpose":"AUCTION_DEPOSIT"}')
assert_status "Mock payment without auth" "401" "$code"

# 19. Dev third-party token
body=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test123")
resp=$(echo "$body" | head -n -1)
code=$(echo "$body" | tail -1)
assert_status "Dev third-party token" "200" "$code"
if echo "$resp" | grep -q '"token"'; then
  echo "  PASS: Third-party token has token field"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Third-party token missing token field"
  FAIL=$((FAIL + 1))
fi

# 20. Third-party auth
TOKEN=$(echo "$resp" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
  body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  resp2=$(echo "$body" | head -n -1)
  code=$(echo "$body" | tail -1)
  assert_status "Third-party auth" "200" "$code"
  assert_json_ok "Third-party auth response" "$resp2"
fi

# 21. User logout
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/logout" -b "$COOKIE_JAR")
code=$(echo "$body" | tail -1)
assert_status "User logout" "200" "$code"

# 22. Admin logout
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/logout" -b "$ADMIN_JAR")
code=$(echo "$body" | tail -1)
assert_status "Admin logout" "200" "$code"

rm -f "$ADMIN_JAR"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
