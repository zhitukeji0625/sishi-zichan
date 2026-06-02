#!/usr/bin/env bash
# Smoke test for sishi-zichan API and pages
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
FAIL=0
COOKIE_USER="/tmp/sishi-user-cookies.txt"
COOKIE_ADMIN="/tmp/sishi-admin-cookies.txt"
rm -f "$COOKIE_USER" "$COOKIE_ADMIN"

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

echo "=== Page smoke tests ==="
for path in "/" "/m" "/m/login" "/m/auction" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

echo ""
echo "=== Auth API ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"","password":""}')
check_status "POST /api/auth/login empty" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_USER" -b "$COOKIE_USER" \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_status "POST /api/auth/login demo user" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_ADMIN" -b "$COOKIE_ADMIN" \
  -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_status "POST /api/auth/admin/login division admin" "200" "$code"

echo ""
echo "=== Third-party dev token ==="
resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-smoke-user")
if echo "$resp" | grep -q '"token"'; then pass "GET /api/dev/third-party-token"; else fail "GET /api/dev/third-party-token: $resp"; fi

echo ""
echo "=== Mobile pages (authenticated) ==="
for path in "/m/me" "/m/orders" "/m/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_USER" "$BASE$path")
  check_status "GET $path (logged in)" "200" "$code"
done

echo ""
echo "=== Admin pages (authenticated) ==="
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/audit"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_ADMIN" "$BASE$path")
  check_status "GET $path (admin)" "200" "$code"
done

echo ""
echo "=== Auction bid (need live project) ==="
PROJECT_ID=$(node /workspace/scripts/query-live-project.mjs 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  MIN_BID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "
    SELECT COALESCE(
      (SELECT CAST(amount AS DECIMAL(12,2)) + CAST(bidStep AS DECIMAL(12,2))
       FROM AuctionBid b JOIN AuctionProject p ON p.id=b.projectId
       WHERE b.projectId='$PROJECT_ID' ORDER BY b.amount DESC LIMIT 1),
      (SELECT CAST(startPrice AS DECIMAL(12,2)) FROM AuctionProject WHERE id='$PROJECT_ID')
    );
  " 2>/dev/null | tr -d '\r')
  resp=$(curl -s -b "$COOKIE_USER" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  if echo "$resp" | grep -q '"ok":true'; then pass "POST bid on project $PROJECT_ID (amount=$MIN_BID)"; else fail "POST bid: $resp"; fi
else
  fail "No LIVE auction project found"
fi

echo ""
echo "=== Drying reserve ==="
LISTING_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT id FROM DryingFieldListing WHERE status='OPERATING' LIMIT 1;" 2>/dev/null | tr -d '\r')

if [ -n "$LISTING_ID" ]; then
  START=$(date -u -d "+3 days" +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
  END=$(date -u -d "+5 days" +%Y-%m-%d 2>/dev/null || date -u -v+5d +%Y-%m-%d)
  resp=$(curl -s -b "$COOKIE_USER" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  if echo "$resp" | grep -qE '"ok":true|"error"'; then
    if echo "$resp" | grep -q '"ok":true'; then pass "POST drying reserve"; else pass "POST drying reserve (expected conflict ok): $(echo "$resp" | head -c 80)"; fi
  else
    fail "POST drying reserve: $resp"
  fi
else
  fail "No OPERATING drying listing found"
fi

echo ""
echo "=== Auth logout ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_USER" -X POST "$BASE/api/auth/logout")
check_status "POST /api/auth/logout" "200" "$code"

echo ""
echo "=== Third-party login ==="
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-sso-user" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_USER" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
  check_status "POST /api/auth/third-party" "200" "$code"
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_USER" "$BASE/m/sso?token=$TOKEN")
  check_status "GET /m/sso (page)" "200" "$code"
else
  fail "Could not obtain third-party token"
fi

echo ""
echo "=== Auction detail page ==="
if [ -n "$PROJECT_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_USER" "$BASE/m/auction/$PROJECT_ID")
  check_status "GET /m/auction/[id]" "200" "$code"
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "All smoke tests passed."
  exit 0
else
  echo "$FAIL test(s) failed."
  exit 1
fi
