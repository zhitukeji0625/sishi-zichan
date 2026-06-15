#!/usr/bin/env bash
# API smoke tests — requires dev server at BASE (default http://localhost:3000)
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp}"

check() {
  local name="$1" expect="$2" actual="$3"
  if echo "$actual" | grep -qE "$expect"; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name"
    echo "  expected: $expect"
    echo "  got: $actual"
    FAIL=$((FAIL + 1))
  fi
  return 0
}

check_code() {
  local name="$1" expect="$2" actual="$3"
  if [ "$actual" = "$expect" ]; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (HTTP $actual, expected $expect)"
    FAIL=$((FAIL + 1))
  fi
}

echo "Functional tests against $BASE"
echo "---"

# Static pages
check_code "Home page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check_code "Mobile home" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check_code "Admin login page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check_code "Auction list" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check_code "Drying list" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"

# Auth
R=$(curl -s -c "$TMPDIR/sishi_user_cookies.txt" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check "User login" '"ok":true' "$R"

R=$(curl -s -c "$TMPDIR/sishi_admin_cookies.txt" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check "Admin login" '"ok":true' "$R"

# Dev third-party token
R=$(curl -s "$BASE/api/dev/third-party-token?u_id=test_user_001")
check "Dev third-party token" '"token"' "$R"

# Admin assets must reject non-multipart with 400
CODE=$(curl -s -o /tmp/sishi_assets_resp.txt -w '%{http_code}' -b "$TMPDIR/sishi_admin_cookies.txt" \
  -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}')
RESP=$(cat /tmp/sishi_assets_resp.txt)
if [ "$CODE" = "400" ] && echo "$RESP" | grep -q '"error"'; then
  echo "✓ Admin assets rejects non-multipart (400)"
  PASS=$((PASS + 1))
else
  echo "✗ Admin assets rejects non-multipart (got HTTP $CODE: $RESP)"
  FAIL=$((FAIL + 1))
fi

# Auction bid
AUCTION_ID=$(curl -s "$BASE/m/auction" | grep -oE '/m/auction/[a-z0-9]{20,}' | head -1 | sed 's|/m/auction/||')
if [ -n "$AUCTION_ID" ]; then
  DETAIL=$(curl -s -b "$TMPDIR/sishi_user_cookies.txt" "$BASE/m/auction/$AUCTION_ID")
  MIN_BID=$(echo "$DETAIL" | grep -oE 'min="[0-9.]+"' | head -1 | grep -oE '[0-9.]+' || true)
  MIN_BID="${MIN_BID:-8200}"
  R=$(curl -s -b "$TMPDIR/sishi_user_cookies.txt" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  check "Auction bid" '"ok":true' "$R"
else
  echo "✗ Auction bid — no project ID found on /m/auction"
  FAIL=$((FAIL + 1))
fi

# Drying reserve
LISTING_ID=$(curl -s "$BASE/m/drying" | grep -oE '/m/drying/[a-z0-9]{20,}' | head -1 | sed 's|/m/drying/||')
if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+2 days" +%Y-%m-%d 2>/dev/null || date -v+2d +%Y-%m-%d)
  END=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  R=$(curl -s -b "$TMPDIR/sishi_user_cookies.txt" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check "Drying reserve" '"ok":true' "$R"
else
  echo "✗ Drying reserve — no listing ID found on /m/drying"
  FAIL=$((FAIL + 1))
fi

# Admin dashboard (authenticated via cookie from login page flow — use admin cookie)
check_code "Admin dashboard" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$TMPDIR/sishi_admin_cookies.txt" "$BASE/admin")"

echo "---"
echo "Results: $PASS passed, $FAIL failed"
exit "$FAIL"
