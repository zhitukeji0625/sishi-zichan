#!/usr/bin/env bash
# Smoke test for sishi-zichan — run against a live dev server on :3000
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/smoke-user.txt"
ADMIN_JAR="/tmp/smoke-admin.txt"
rm -f "$COOKIE_JAR" "$ADMIN_JAR"

pass=0
fail=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "✓ $name"
    pass=$((pass + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    fail=$((fail + 1))
  fi
}

# --- Public pages ---
for path in / /m /admin/login /m/login /m/register /m/auction /m/drying; do
  check "GET $path" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")"
done

# --- Admin login & pages ---
curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' > /dev/null

for path in /admin /admin/assets /admin/auctions /admin/drying /admin/organizations \
  /admin/admins /admin/announcements /admin/registrations /admin/audit /admin/config /admin/dict; do
  check "GET $path (admin)" "200" "$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' "$BASE$path")"
done

# --- User login & pages ---
curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' > /dev/null

for path in /m/me /m/orders; do
  check "GET $path (user)" "200" "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$BASE$path")"
done

# --- Invalid multipart returns 400, not 500 ---
check "POST /api/upload invalid content-type" "400" \
  "$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')"
check "POST /api/admin/assets invalid content-type" "400" \
  "$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{}')"

# --- Third-party SSO ---
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
  check "GET /m/sso?token=..." "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/sso?token=$TOKEN")"
else
  echo "✗ third-party token"
  fail=$((fail + 1))
fi

# --- Bid on live auction ---
AUCTION_ID=$(curl -s -b "$COOKIE_JAR" "$BASE/m/auction" | grep -oP '/m/auction/[a-z0-9]{15,}' | head -1 | cut -d/ -f4)
if [ -n "$AUCTION_ID" ]; then
  check "GET /m/auction/$AUCTION_ID" "200" \
    "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$BASE/m/auction/$AUCTION_ID")"
  BID=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount": 99999}')
  if echo "$BID" | grep -q '"ok":true'; then
    echo "✓ POST bid succeeds"
    pass=$((pass + 1))
  else
    echo "✗ POST bid: $BID"
    fail=$((fail + 1))
  fi
else
  echo "✗ no auction found"
  fail=$((fail + 1))
fi

# --- Drying reserve ---
DRYING_ID=$(curl -s -b "$COOKIE_JAR" "$BASE/m/drying" | grep -oP '/m/drying/[a-z0-9]{15,}' | head -1 | cut -d/ -f4)
if [ -n "$DRYING_ID" ]; then
  check "GET /m/drying/$DRYING_ID" "200" \
    "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$BASE/m/drying/$DRYING_ID")"
  START_DATE=$(date -u -d "+3 days" +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
  END_DATE=$(date -u -d "+4 days" +%Y-%m-%d 2>/dev/null || date -u -v+4d +%Y-%m-%d)
  RESERVE=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$DRYING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  if echo "$RESERVE" | grep -q '"ok":true'; then
    echo "✓ POST drying reserve succeeds"
    pass=$((pass + 1))
  else
    echo "✗ POST drying reserve: $RESERVE"
    fail=$((fail + 1))
  fi
fi

echo ""
echo "Smoke test: $pass passed, $fail failed"
exit "$fail"
