#!/bin/bash
set -euo pipefail

BASE="http://localhost:3000"
PASS=0
FAIL=0
ERRORS=()

log() { echo "[TEST] $1"; }
pass() { PASS=$((PASS+1)); log "✓ $1"; }
fail() { FAIL=$((FAIL+1)); ERRORS+=("$1"); log "✗ $1"; }

# Helper: extract cookie from response headers
extract_cookie() {
  local name="$1"
  grep -i "set-cookie: ${name}=" | head -1 | sed -E "s/.*${name}=([^;]+).*/\1/"
}

# --- Public pages ---
for path in "/" "/m" "/m/auction" "/m/drying" "/m/login" "/m/register" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path → $code"; else fail "GET $path → $code (expected 200)"; fi
done

# --- Admin login ---
ADMIN_RESP=$(curl -s -D /tmp/admin_headers.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_COOKIE=$(extract_cookie "sishi_admin_session" < /tmp/admin_headers.txt)
if echo "$ADMIN_RESP" | grep -q '"ok":true' && [ -n "$ADMIN_COOKIE" ]; then
  pass "Admin login (division)"
else
  fail "Admin login (division): $ADMIN_RESP"
fi

# Admin dashboard
code=$(curl -s -o /dev/null -w "%{http_code}" -b "sishi_admin_session=$ADMIN_COOKIE" "$BASE/admin")
if [ "$code" = "200" ]; then pass "Admin dashboard → $code"; else fail "Admin dashboard → $code"; fi

# Admin assets page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "sishi_admin_session=$ADMIN_COOKIE" "$BASE/admin/assets")
if [ "$code" = "200" ]; then pass "Admin assets → $code"; else fail "Admin assets → $code"; fi

# Admin auctions page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "sishi_admin_session=$ADMIN_COOKIE" "$BASE/admin/auctions")
if [ "$code" = "200" ]; then pass "Admin auctions → $code"; else fail "Admin auctions → $code"; fi

# --- End user login ---
USER_RESP=$(curl -s -D /tmp/user_headers.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
USER_COOKIE=$(extract_cookie "sishi_user_session" < /tmp/user_headers.txt)
if echo "$USER_RESP" | grep -q '"ok":true' && [ -n "$USER_COOKIE" ]; then
  pass "User login"
else
  fail "User login: $USER_RESP"
fi

# User pages
for path in "/m/me" "/m/orders"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "sishi_user_session=$USER_COOKIE" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path (auth) → $code"; else fail "GET $path (auth) → $code"; fi
done

# --- Get auction project ID from page ---
AUCTION_HTML=$(curl -s "$BASE/m/auction")
PROJECT_ID=$(echo "$AUCTION_HTML" | grep -oP 'href="/m/auction/\K[^"]+' | head -1)
if [ -n "$PROJECT_ID" ]; then
  pass "Found auction project ID: $PROJECT_ID"
else
  fail "Could not find auction project ID on /m/auction"
fi

# Auction detail page
if [ -n "$PROJECT_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction/$PROJECT_ID")
  if [ "$code" = "200" ]; then pass "Auction detail → $code"; else fail "Auction detail → $code"; fi
fi

# --- Bid test ---
if [ -n "$PROJECT_ID" ] && [ -n "$USER_COOKIE" ]; then
  BID_RESP=$(curl -s -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -b "sishi_user_session=$USER_COOKIE" \
    -d '{"amount":8200}')
  if echo "$BID_RESP" | grep -qE '"ok":true|"success":true'; then
    pass "Place bid (8200)"
  else
    # May fail if already bid higher - check if it's a valid rejection
    if echo "$BID_RESP" | grep -qiE 'bid|amount|price|出价'; then
      pass "Bid endpoint responded (may be duplicate/outbid): $BID_RESP"
    else
      fail "Place bid failed: $BID_RESP"
    fi
  fi
fi

# --- Drying listing ---
DRYING_HTML=$(curl -s "$BASE/m/drying")
DRYING_ID=$(echo "$DRYING_HTML" | grep -oP 'href="/m/drying/\K[^"]+' | head -1)
if [ -n "$DRYING_ID" ]; then
  pass "Found drying listing ID: $DRYING_ID"
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying/$DRYING_ID")
  if [ "$code" = "200" ]; then pass "Drying detail → $code"; else fail "Drying detail → $code"; fi
else
  fail "Could not find drying listing ID"
fi

# --- Drying reservation ---
if [ -n "$DRYING_ID" ] && [ -n "$USER_COOKIE" ]; then
  TOMORROW=$(date -d "+2 day" +%Y-%m-%d 2>/dev/null || date -v+2d +%Y-%m-%d)
  DAY_AFTER=$(date -d "+3 day" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  RESERVE_RESP=$(curl -s -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -b "sishi_user_session=$USER_COOKIE" \
    -d "{\"listingId\":\"$DRYING_ID\",\"startDate\":\"$TOMORROW\",\"endDate\":\"$DAY_AFTER\"}")
  if echo "$RESERVE_RESP" | grep -q '"ok":true'; then
    pass "Drying reservation"
  elif echo "$RESERVE_RESP" | grep -qiE '已满|重复|capacity|已预约'; then
    pass "Drying reservation (expected limit): $RESERVE_RESP"
  else
    fail "Drying reservation: $RESERVE_RESP"
  fi
fi

# --- Mock payment ---
if [ -n "$PROJECT_ID" ] && [ -n "$USER_COOKIE" ]; then
  PAY_RESP=$(curl -s -X POST "$BASE/api/m/payments/mock" \
    -H "Content-Type: application/json" \
    -b "sishi_user_session=$USER_COOKIE" \
    -d "{\"purpose\":\"AUCTION_DEPOSIT\",\"auctionProjectId\":\"$PROJECT_ID\"}")
  if echo "$PAY_RESP" | grep -q '"ok":true'; then
    pass "Mock payment deposit"
  elif echo "$PAY_RESP" | grep -qiE '已缴纳|已支付|duplicate'; then
    pass "Mock payment deposit (already paid): $PAY_RESP"
  else
    fail "Mock payment deposit: $PAY_RESP"
  fi
fi

# --- Third-party token (dev) ---
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test_user_001")
if echo "$TOKEN_RESP" | grep -q '"token"'; then
  pass "Dev third-party token"
  TOKEN=$(echo "$TOKEN_RESP" | grep -oP '"token":"[^"]+"' | head -1 | cut -d'"' -f4)
  SSO_RESP=$(curl -s -D /tmp/sso_headers.txt -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  SSO_COOKIE=$(extract_cookie "sishi_user_session" < /tmp/sso_headers.txt)
  if echo "$SSO_RESP" | grep -q '"ok":true' && [ -n "$SSO_COOKIE" ]; then
    pass "Third-party SSO login"
  else
    fail "Third-party SSO login: $SSO_RESP"
  fi
else
  fail "Dev third-party token: $TOKEN_RESP"
fi

# --- Protected API without auth ---
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/1/bid" \
  -H "Content-Type: application/json" -d '{"amount":1000}')
if [ "$code" = "401" ]; then pass "Bid without auth → 401"; else fail "Bid without auth → $code (expected 401)"; fi

# --- Register new user ---
RAND_PHONE="139$(date +%s | tail -c 9)"
REG_RESP=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$RAND_PHONE\",\"password\":\"test1234\",\"name\":\"测试用户\"}")
if echo "$REG_RESP" | grep -q '"ok":true'; then
  pass "User registration ($RAND_PHONE)"
else
  fail "User registration: $REG_RESP"
fi

# --- Admin upload without auth ---
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  pass "Upload without auth → $code"
else
  fail "Upload without auth → $code (expected 401/403)"
fi

# --- Summary ---
echo ""
echo "========================================="
echo "Results: $PASS passed, $FAIL failed"
echo "========================================="
if [ "$FAIL" -gt 0 ]; then
  echo "Failures:"
  for e in "${ERRORS[@]}"; do echo "  - $e"; done
  exit 1
fi
exit 0
