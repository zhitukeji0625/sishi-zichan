#!/bin/bash
# Functional smoke test for sishi-zichan API
set -euo pipefail
BASE="http://localhost:3000"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)

pass() { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name (HTTP $actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

echo "=== Smoke Test: $BASE ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check_status "Homepage" "200" "$code"

# 2. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check_status "Admin login page" "200" "$code"

# 3. Mobile home
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
check_status "Mobile home" "200" "$code"

# 4. Admin login API
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
if [ "$code" = "200" ] && echo "$body" | grep -q '"ok"'; then pass "Admin login API"; else fail "Admin login API ($code: $body)"; fi

# 5. User login API
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
if [ "$code" = "200" ] && echo "$body" | grep -q '"ok"'; then pass "User login API"; else fail "User login API ($code: $body)"; fi

# 6. User register API
PHONE="199$(date +%s | tail -c 9)"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
if [ "$code" = "200" ] && echo "$body" | grep -q '"ok"'; then pass "User register API"; else fail "User register API ($code: $body)"; fi

# 7. Third-party token (dev)
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
if [ "$code" = "200" ] && echo "$body" | grep -q 'token'; then pass "Third-party token API"; else fail "Third-party token API ($code: $body)"; fi

# 8. Upload without multipart (should be 400, not 500)
resp=$(curl -s -w "\n%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" \
  -d '{"file":"test"}')
code=$(echo "$resp" | tail -1)
if [ "$code" = "400" ] || [ "$code" = "401" ]; then pass "Upload non-multipart returns $code"; else fail "Upload non-multipart (expected 400, got $code)"; fi

# 9. Admin assets without multipart
resp=$(curl -s -w "\n%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}')
code=$(echo "$resp" | tail -1)
if [ "$code" = "400" ] || [ "$code" = "401" ]; then pass "Admin assets non-multipart returns $code"; else fail "Admin assets non-multipart (expected 400, got $code)"; fi

# 10. Unauthenticated bid (should be 401)
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/fake-id/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":1000}')
code=$(echo "$resp" | tail -1)
check_status "Unauthenticated bid" "401" "$code"

# 11. Get auction list page and extract project ID
html=$(curl -s -b "$COOKIE_JAR" "$BASE/m/auction")
project_id=$(echo "$html" | grep -oE 'c[a-z0-9]{20,}' | head -1 || true)
if [ -n "$project_id" ]; then pass "Auction list has project ID: $project_id"; else fail "Auction list missing project ID"; fi

# 12. Auction bid (if project found)
if [ -n "$project_id" ]; then
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$project_id/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":999999}')
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  # Should succeed or fail with business logic error (400), not 500
  if [ "$code" = "200" ]; then pass "Auction bid API ($code)"; elif [ "$code" = "400" ]; then pass "Auction bid API rejected ($body)"; else fail "Auction bid API ($code: $body)"; fi
fi

# 13. Drying reserve
listing_id=$(echo "$html" | grep -oE 'c[a-z0-9]{20,}' | tail -1 || true)
# Get drying listing from DB via auction page or drying page
drying_html=$(curl -s -b "$COOKIE_JAR" "$BASE/m/drying")
drying_id=$(echo "$drying_html" | grep -oE 'c[a-z0-9]{20,}' | head -1 || true)
if [ -n "$drying_id" ]; then
  start=$(date -d "+5 days" +%Y-%m-%d 2>/dev/null || date -v+5d +%Y-%m-%d)
  end=$(date -d "+6 days" +%Y-%m-%d 2>/dev/null || date -v+6d +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$drying_id\",\"startDate\":\"$start\",\"endDate\":\"$end\"}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  if [ "$code" = "200" ]; then pass "Drying reserve API"; elif [ "$code" = "400" ]; then pass "Drying reserve rejected ($body)"; else fail "Drying reserve API ($code: $body)"; fi
else
  fail "Drying listing ID not found"
fi

# 14. Admin dashboard (authenticated)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
check_status "Admin dashboard" "200" "$code"

# 15. Admin assets page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/assets")
check_status "Admin assets page" "200" "$code"

# 16. Admin auctions page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/auctions")
check_status "Admin auctions page" "200" "$code"

# 17. Mobile me page (authenticated)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/me")
check_status "Mobile me page" "200" "$code"

# 18. Mobile orders page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/orders")
check_status "Mobile orders page" "200" "$code"

# 19. Build check - just verify dev is running
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/auth/logout" -X POST -b "$COOKIE_JAR")
if [ "$code" = "200" ]; then pass "User logout API"; else fail "User logout API ($code)"; fi

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
