#!/usr/bin/env bash
# API smoke tests — requires dev server on localhost:3000
set -euo pipefail
BASE="http://localhost:3000"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_body_contains() {
  local name="$1" body="$2" pattern="$3"
  if echo "$body" | grep -q "$pattern"; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (body missing '$pattern')"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests against $BASE ==="

# 1. Public pages
for path in "/" "/admin/login" "/m" "/m/auction" "/m/drying" "/m/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

# 2. Admin login
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "POST /api/auth/admin/login" "200" "$code"
assert_body_contains "admin login ok" "$body" '"ok":true'

# 3. Admin pages
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/announcements"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  assert_status "GET $path (admin)" "200" "$code"
done

# 4. Upload without multipart (should 400, not 500)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
assert_status "POST /api/upload non-multipart" "400" "$code"

# 5. Admin assets without multipart
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
assert_status "POST /api/admin/assets non-multipart" "400" "$code"

# 6. User login
USER_JAR=$(mktemp)
resp=$(curl -s -w "\n%{http_code}" -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "POST /api/auth/login" "200" "$code"
assert_body_contains "user login ok" "$body" '"ok":true'

# 7. Bid without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake-id/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
assert_status "POST bid unauthenticated" "401" "$code"

# 8. Get auction project ID from page
auction_html=$(curl -s "$BASE/m/auction")
project_id=$(echo "$auction_html" | grep -oE 'c[a-z0-9]{20,}' | head -1 || true)
if [[ -z "$project_id" ]]; then
  echo "  ✗ extract auction projectId from /m/auction"
  FAIL=$((FAIL + 1))
else
  echo "  ✓ extract auction projectId: $project_id"
  PASS=$((PASS + 1))

  # 9. Compute min bid (top + step, or startPrice) via MariaDB
  min_bid=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "
    SELECT COALESCE(
      (SELECT b.amount + p.bidStep FROM AuctionBid b
       JOIN AuctionProject p ON b.projectId = p.id
       WHERE p.id = '$project_id' ORDER BY b.amount DESC LIMIT 1),
      (SELECT startPrice FROM AuctionProject WHERE id = '$project_id')
    );
  " 2>/dev/null || echo "0")
  resp=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/auction/$project_id/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$min_bid}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')
  assert_status "POST bid authenticated" "200" "$code"
  assert_body_contains "bid ok" "$body" '"ok":true'
fi

# 10. Drying reserve without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -d '{"listingId":"x","startDate":"2026-10-01","endDate":"2026-10-05"}')
assert_status "POST reserve unauthenticated" "401" "$code"

# 11. Get drying listing ID
drying_html=$(curl -s "$BASE/m/drying")
listing_id=$(echo "$drying_html" | grep -oE 'c[a-z0-9]{20,}' | head -1 || true)
if [[ -z "$listing_id" ]]; then
  echo "  ✗ extract drying listingId from /m/drying"
  FAIL=$((FAIL + 1))
else
  echo "  ✓ extract drying listingId: $listing_id"
  PASS=$((PASS + 1))
  resp=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$listing_id\",\"startDate\":\"2026-12-01\",\"endDate\":\"2026-12-05\"}")
  code=$(echo "$resp" | tail -1)
  assert_status "POST reserve authenticated" "200" "$code"
fi

# 12. Register new user
phone="199$(date +%s | tail -c 9)"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$phone\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/register" "200" "$code"

# 13. Dev third-party token
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
assert_status "GET /api/dev/third-party-token" "200" "$code"
assert_body_contains "third-party token" "$body" '"token"'

# 14. Invalid login
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')
assert_status "POST login wrong password" "401" "$code"

# 15. Logout
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/auth/logout")
assert_status "POST /api/auth/logout" "200" "$code"

rm -f "$USER_JAR"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
