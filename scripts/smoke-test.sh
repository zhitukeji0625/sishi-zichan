#!/usr/bin/env bash
# End-to-end smoke tests for sishi-zichan (requires dev server on :3000)
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

ok() { echo "✓ $1"; PASS=$((PASS+1)); }
fail() { echo "✗ $1: $2"; FAIL=$((FAIL+1)); }

check_http() {
  local name="$1" url="$2" expect="$3" cookies="${4:-}"
  local code
  if [ -n "$cookies" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -b "$cookies" "$url")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  fi
  if [ "$code" = "$expect" ]; then ok "$name ($code)"; else fail "$name" "expected $expect, got $code"; fi
}

# Public pages
check_http "GET /" "$BASE/" 200
check_http "GET /admin/login" "$BASE/admin/login" 200
check_http "GET /m" "$BASE/m" 200

# User login
USER_RESP=$(curl -s -c /tmp/smoke_user.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
if echo "$USER_RESP" | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('ok') else 1)" 2>/dev/null; then
  ok "User login"
else fail "User login" "$USER_RESP"; fi

# Admin login (must use /api/auth/admin/login)
ADMIN_RESP=$(curl -s -c /tmp/smoke_admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ADMIN_RESP" | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('ok') else 1)" 2>/dev/null; then
  ok "Admin login"
else fail "Admin login" "$ADMIN_RESP"; fi

# Third-party token (dev only)
TP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smokeuser")
if echo "$TP" | python3 -c "import sys,json; exit(0 if 'token' in json.load(sys.stdin) else 1)" 2>/dev/null; then
  ok "Third-party token"
else fail "Third-party token" "$TP"; fi

# Mobile pages
check_http "GET /m/auction" "$BASE/m/auction" 200 /tmp/smoke_user.txt
check_http "GET /m/drying" "$BASE/m/drying" 200 /tmp/smoke_user.txt
check_http "GET /m/me" "$BASE/m/me" 200 /tmp/smoke_user.txt
check_http "GET /m/orders" "$BASE/m/orders" 200 /tmp/smoke_user.txt

# Admin pages
check_http "GET /admin" "$BASE/admin" 200 /tmp/smoke_admin.txt
for page in assets auctions drying dict config audit announcements organizations registrations admins; do
  check_http "GET /admin/$page" "$BASE/admin/$page" 200 /tmp/smoke_admin.txt
done

# Auction bid (dynamic amount)
AUCTION_PAGE=$(curl -s -b /tmp/smoke_user.txt "$BASE/m/auction")
PROJECT_ID=$(echo "$AUCTION_PAGE" | grep -oP 'href="/m/auction/\K[a-z0-9]{20,}' | head -1)
if [ -n "$PROJECT_ID" ]; then
  ok "Found auction project $PROJECT_ID"
  DETAIL=$(curl -s -b /tmp/smoke_user.txt "$BASE/m/auction/$PROJECT_ID")
  BID=$(echo "$DETAIL" | grep -oP '"minBid":\K[0-9]+' | head -1 || true)
  if [ -z "$BID" ]; then
    BID=$(echo "$DETAIL" | grep -oP 'min="\K[0-9]+' | head -1 || true)
  fi
  if [ -z "$BID" ]; then BID=8000; fi
  BID_RESP=$(curl -s -b /tmp/smoke_user.txt -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$BID}")
  if echo "$BID_RESP" | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('ok') else 1)" 2>/dev/null; then
    ok "Place bid $BID"
  else fail "Place bid" "$BID_RESP"; fi
else
  fail "Auction project" "not found on /m/auction"
fi

# Drying reservation
DRYING_PAGE=$(curl -s -b /tmp/smoke_user.txt "$BASE/m/drying")
LISTING_ID=$(echo "$DRYING_PAGE" | grep -oP 'href="/m/drying/\K[a-z0-9]{20,}' | head -1)
if [ -n "$LISTING_ID" ]; then
  ok "Found drying listing $LISTING_ID"
  START=$(date -d "+1 day" +%Y-%m-%d 2>/dev/null || date -v+1d +%Y-%m-%d)
  END=$(date -d "+2 day" +%Y-%m-%d 2>/dev/null || date -v+2d +%Y-%m-%d)
  RESERVE_RESP=$(curl -s -b /tmp/smoke_user.txt -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  if echo "$RESERVE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('ok') or d.get('id') else 1)" 2>/dev/null; then
    ok "Drying reservation"
  else fail "Drying reservation" "$RESERVE_RESP"; fi
else
  fail "Drying listing" "not found on /m/drying"
fi

# SSO
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=smokeuser" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
SSO_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/m/sso?token=$TOKEN")
if [ "$SSO_CODE" = "200" ]; then ok "SSO login ($SSO_CODE)"; else fail "SSO login" "HTTP $SSO_CODE"; fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
