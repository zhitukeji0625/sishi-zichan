#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/functional-test-cookies.txt"
ADMIN_JAR="/tmp/functional-test-admin-cookies.txt"
rm -f "$COOKIE_JAR" "$ADMIN_JAR"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_contains() {
  local name="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (missing '$needle' in: $haystack)"
    FAIL=$((FAIL + 1))
  fi
}

# Page routes
for path in "/" "/admin/login" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/m/me" "/m/orders"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# Admin login
resp=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_contains "Admin login" '"ok":true' "$resp"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
check "Admin dashboard (authenticated)" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/dict")
check "Admin dict page" "200" "$code"

# User login
resp=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_contains "User login" '"ok":true' "$resp"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/me")
check "User me page (authenticated)" "200" "$code"

# Third-party token
resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-user-001")
check_contains "Third-party token" 'token' "$resp"

# DB lookups via MariaDB
AUCTION_ROW=$(sudo docker exec mariadb mariadb -uroot -proot -N -e \
  "SELECT id, status FROM sishi.AuctionProject ORDER BY createdAt DESC LIMIT 1" 2>/dev/null || true)
AUCTION_ID=$(echo "$AUCTION_ROW" | awk '{print $1}')
AUCTION_STATUS=$(echo "$AUCTION_ROW" | awk '{print $2}')
LISTING_ID=$(sudo docker exec mariadb mariadb -uroot -proot -N -e \
  "SELECT id FROM sishi.DryingFieldListing WHERE status='OPERATING' LIMIT 1" 2>/dev/null || true)

if [ -n "$AUCTION_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction/$AUCTION_ID")
  check "Auction detail page" "200" "$code"
fi

if [ "$AUCTION_STATUS" = "LIVE" ] && [ -n "$AUCTION_ID" ]; then
  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount": 15000}')
  check_contains "Place bid" '"ok":true' "$resp"
else
  echo "✗ Demo auction not LIVE (status=$AUCTION_STATUS)"
  FAIL=$((FAIL + 1))
fi

if [ -n "$LISTING_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying/$LISTING_ID")
  check "Drying detail page" "200" "$code"

  START=$(date -u -d "+7 days" +%Y-%m-%d 2>/dev/null || date -u -v+7d +%Y-%m-%d)
  END=$(date -u -d "+10 days" +%Y-%m-%d 2>/dev/null || date -u -v+10d +%Y-%m-%d)
  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check_contains "Drying reservation" '"ok":true' "$resp"
fi

if [ -n "$AUCTION_ID" ]; then
  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/payments/mock" \
    -H "Content-Type: application/json" \
    -d "{\"purpose\":\"AUCTION_DEPOSIT\",\"auctionProjectId\":\"$AUCTION_ID\"}")
  if echo "$resp" | grep -q '"ok":true\|保证金已缴纳'; then
    echo "✓ Mock payment (deposit)"
    PASS=$((PASS + 1))
  else
    echo "✗ Mock payment (deposit): $resp"
    FAIL=$((FAIL + 1))
  fi
fi

# Logout
resp=$(curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
check_contains "User logout" '"ok":true' "$resp"

if [ -n "$AUCTION_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount": 15000}')
  check "Unauthenticated bid rejected" "401" "$code"
fi

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
check "Invalid login rejected" "401" "$code"

DICT_COUNT=$(sudo docker exec mariadb mariadb -uroot -proot -N -e \
  "SELECT COUNT(*) FROM sishi.DictCategory" 2>/dev/null || echo "0")
if [ "${DICT_COUNT:-0}" -gt 0 ]; then
  echo "✓ Dict categories seeded ($DICT_COUNT)"
  PASS=$((PASS + 1))
else
  echo "✗ Dict categories missing"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
exit "$FAIL"
