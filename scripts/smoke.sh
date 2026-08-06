#!/usr/bin/env bash
# End-to-end smoke tests against a running dev server (default http://localhost:3000).
set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
USER_JAR="/tmp/smoke_user.txt"
ADMIN_JAR="/tmp/smoke_admin.txt"
PASS=0
FAIL=0

ok() { echo "  OK  $1"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL + 1)); }

check_page() {
  local path="$1"
  local jar="${2:-}"
  local code
  if [ -n "$jar" ]; then
    code=$(curl -s -b "$jar" -o /dev/null -w "%{http_code}" "$BASE$path")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  fi
  if [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "307" ]; then
    ok "$path ($code)"
  else
    bad "$path ($code)"
  fi
}

echo "=== Smoke tests: $BASE ==="

# Health
check_page "/"
check_page "/m"
check_page "/m/login"
check_page "/admin/login"

# Login
USER_LOGIN=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$USER_LOGIN" | grep -q '"ok":true' && ok "user login" || bad "user login: $USER_LOGIN"

ADMIN_LOGIN=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$ADMIN_LOGIN" | grep -q '"ok":true' && ok "admin login" || bad "admin login: $ADMIN_LOGIN"

# Authenticated pages
for path in "/m/me" "/m/auction" "/m/drying" "/m/orders" "/admin" "/admin/assets" "/admin/auctions" "/admin/dict" "/admin/drying"; do
  jar="$USER_JAR"
  [[ "$path" == /admin* ]] && jar="$ADMIN_JAR"
  check_page "$path" "$jar"
done

# Dict dropdown populated
ORG_HTML=$(curl -s -b "$ADMIN_JAR" "$BASE/admin/organizations")
echo "$ORG_HTML" | grep -q '<option value="DIVISION">' && ok "org_level dict in organizations form" || bad "org_level dict missing"

# Auction bid
AUCTION_ID=$(curl -s -b "$USER_JAR" "$BASE/m/auction" | grep -oP 'href="/m/auction/\K[^"]+' | head -1)
if [ -n "$AUCTION_ID" ]; then
  DETAIL=$(curl -s -b "$USER_JAR" "$BASE/m/auction/$AUCTION_ID")
  MIN_BID=$(echo "$DETAIL" | grep -oP 'min="\K[0-9]+' | head -1)
  MIN_BID="${MIN_BID:-8000}"
  BID=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  echo "$BID" | grep -q '"ok":true' && ok "auction bid ($MIN_BID)" || bad "auction bid: $BID"
else
  bad "no auction project found"
fi

# Drying reserve
LISTING_ID=$(curl -s -b "$USER_JAR" "$BASE/m/drying" | grep -oP 'href="/m/drying/\K[^"]+' | head -1)
if [ -n "$LISTING_ID" ]; then
  # Use a far-future window to avoid collisions with prior smoke runs
  OFFSET=$((30 + RANDOM % 60))
  START=$(date -u -d "+${OFFSET} days" +%Y-%m-%d 2>/dev/null || date -u -v+${OFFSET}d +%Y-%m-%d)
  END=$(date -u -d "+$((OFFSET + 2)) days" +%Y-%m-%d 2>/dev/null || date -u -v+$((OFFSET + 2))d +%Y-%m-%d)
  RES=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  echo "$RES" | grep -q '"ok":true' && ok "drying reserve" || bad "drying reserve: $RES"
else
  bad "no drying listing found"
fi

# Third-party SSO
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_user" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)
if [ -n "$TOKEN" ]; then
  SSO_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/m/sso?token=$TOKEN")
  [ "$SSO_CODE" = "200" ] && ok "SSO login" || bad "SSO login ($SSO_CODE)"
else
  bad "third-party token"
fi

# Upload validation (wrong mime)
UPLOAD=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/upload" -F "file=@package.json;type=application/json")
echo "$UPLOAD" | grep -q "仅支持" && ok "upload rejects non-image" || bad "upload validation: $UPLOAD"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
