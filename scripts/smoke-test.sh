#!/usr/bin/env bash
# Functional smoke test for sishi-zichan (requires dev server on :3000)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test: $BASE ==="

# 1. Public pages
check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

# 2. Admin login
ADMIN_RESP=$(curl -s -c /tmp/smoke-admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')
check "admin login ok" "true" "$(echo "$ADMIN_RESP" | grep -q '"ok":true' && echo true || echo false)"

ADMIN_PAGES="/admin /admin/assets /admin/auctions /admin/dict /admin/organizations /admin/admins /admin/announcements /admin/registrations /admin/drying /admin/config /admin/audit"
for path in $ADMIN_PAGES; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke-admin.txt "$BASE$path")
  check "GET $path" 200 "$code"
done

# 3. User login
USER_RESP=$(curl -s -c /tmp/smoke-user.txt -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')
check "user login ok" "true" "$(echo "$USER_RESP" | grep -q '"ok":true' && echo true || echo false)"

USER_PAGES="/m /m/auction /m/drying /m/me /m/orders"
for path in $USER_PAGES; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke-user.txt "$BASE$path")
  check "GET $path" 200 "$code"
done

# 4. Third-party SSO token
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test" | grep -oP '"token":"[^"]+"' | cut -d'"' -f4)
check "dev SSO token" "true" "$([ -n "$TOKEN" ] && echo true || echo false)"
check "GET /m/sso" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/sso?token=$TOKEN")"

# 5. Auction bid (dynamic min amount)
AUCTION_HTML=$(curl -s -b /tmp/smoke-user.txt "$BASE/m/auction")
AUCTION_ID=$(echo "$AUCTION_HTML" | grep -oP 'href="/m/auction/[a-z0-9]+"' | head -1 | grep -oP '/m/auction/\K[a-z0-9]+' || true)
if [ -z "$AUCTION_ID" ]; then
  echo "  ✗ find live auction (no auction link found)"
  FAIL=$((FAIL + 1))
else
  check "GET /m/auction/$AUCTION_ID" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke-user.txt "$BASE/m/auction/$AUCTION_ID")"
  DETAIL=$(curl -s -b /tmp/smoke-user.txt "$BASE/m/auction/$AUCTION_ID")
  MIN_BID=$(echo "$DETAIL" | grep -oP 'min="\K[0-9.]+' | head -1)
  if [ -z "$MIN_BID" ]; then
    MIN_BID=$(echo "$DETAIL" | grep -oP '"minBid":\K[0-9.]+' | head -1)
  fi
  if [ -z "$MIN_BID" ]; then
    CURRENT=$(echo "$DETAIL" | grep -oP '当前最高出价[^0-9]*[0-9]+' | grep -oP '[0-9]+$' | head -1)
    STEP=$(echo "$DETAIL" | grep -oP '加价幅度[^0-9]*[0-9]+' | grep -oP '[0-9]+$' | head -1)
    CURRENT=${CURRENT:-8000}
    STEP=${STEP:-200}
    MIN_BID=$((CURRENT + STEP))
  fi
  BID_RESULT=$(curl -s -b /tmp/smoke-user.txt -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}")
  check "POST bid $MIN_BID" "true" "$(echo "$BID_RESULT" | grep -q '"ok":true' && echo true || echo false)"
fi

# 6. Wrong admin endpoint should fail
WRONG_ADMIN=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')
check "admin via /api/auth/login rejected" "401" "$WRONG_ADMIN"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
