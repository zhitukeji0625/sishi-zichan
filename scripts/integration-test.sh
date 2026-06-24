#!/bin/bash
set -euo pipefail
BASE="http://localhost:3000"
COOKIE_JAR="/tmp/sishi-cookies.txt"
ADMIN_JAR="/tmp/sishi-admin-cookies.txt"
PASS=0
FAIL=0

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

check_contains() {
  local name="$1" needle="$2" body="$3"
  if echo "$body" | grep -q "$needle"; then
    echo "✓ $name"
    PASS=$((PASS+1))
  else
    echo "✗ $name (missing: $needle)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Page Tests ==="
for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

echo ""
echo "=== Auth Tests ==="
# User login
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check "POST /api/auth/login" "200" "$code"
check_contains "login response ok" '"ok":true' "$body"

# Admin login
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check "POST /api/auth/admin/login" "200" "$code"
check_contains "admin login response" '"ok":true' "$body"

# Bad login
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
code=$(echo "$resp" | tail -1)
check "POST /api/auth/login bad password" "401" "$code"

echo ""
echo "=== Third-party token ==="
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-user-001")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check "GET /api/dev/third-party-token" "200" "$code"
check_contains "third-party token" '"token"' "$body"

echo ""
echo "=== Auction bid ==="
PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT id FROM AuctionProject WHERE status='LIVE' LIMIT 1;" 2>/dev/null || true)

if [ -n "$PROJECT_ID" ]; then
  # Get minimum bid amount
  MIN_BID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "
    SELECT COALESCE(
      (SELECT amount + bidStep FROM AuctionBid b JOIN AuctionProject p ON b.projectId=p.id WHERE p.id='$PROJECT_ID' ORDER BY amount DESC LIMIT 1),
      (SELECT startPrice FROM AuctionProject WHERE id='$PROJECT_ID')
    );
  " 2>/dev/null || echo "8200")
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  check "POST /api/m/auction/$PROJECT_ID/bid" "200" "$code"
  check_contains "bid response" '"ok":true' "$body"
else
  echo "✗ No LIVE auction project found"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== Drying reserve ==="
LISTING_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT id FROM DryingFieldListing WHERE status='OPERATING' LIMIT 1;" 2>/dev/null || true)

if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+2 days" +%Y-%m-%d 2>/dev/null || date -v+2d +%Y-%m-%d)
  END=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  # 200 or 409 (already reserved) both acceptable
  if [ "$code" = "200" ] || [ "$code" = "409" ]; then
    echo "✓ POST /api/m/drying/reserve ($code)"
    PASS=$((PASS+1))
  else
    echo "✗ POST /api/m/drying/reserve (expected 200/409, got $code) body=$body"
    FAIL=$((FAIL+1))
  fi
else
  echo "✗ No drying listing found"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== Admin protected pages ==="
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  check "GET $path (authenticated)" "200" "$code"
done

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
exit $FAIL
