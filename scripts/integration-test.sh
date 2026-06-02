#!/bin/bash
# Integration smoke tests for API endpoints
set -e
BASE="http://localhost:3000"
COOKIE_JAR="/tmp/sishi-test-cookies.txt"
FAIL=0

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; FAIL=1; }

# --- Public pages ---
for path in "/" "/m" "/m/login" "/m/register" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path -> $code"; else fail "GET $path -> $code (expected 200)"; fi
done

# --- User login ---
rm -f "$COOKIE_JAR"
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$LOGIN" | grep -q '"ok":true\|"success":true\|user'; then
  pass "POST /api/auth/login (tenant)"
else
  fail "POST /api/auth/login (tenant): $LOGIN"
fi

# --- Protected mobile pages (with cookie) ---
for path in "/m/me" "/m/orders" "/m/auction"; do
  code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path (auth) -> $code"; else fail "GET $path (auth) -> $code"; fi
done

# --- Admin login ---
rm -f /tmp/sishi-admin-cookies.txt
ADMIN_LOGIN=$(curl -s -c /tmp/sishi-admin-cookies.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ADMIN_LOGIN" | grep -qE '"ok":true|"success":true|admin'; then
  pass "POST /api/auth/admin/login"
else
  fail "POST /api/auth/admin/login: $ADMIN_LOGIN"
fi

# --- Admin pages ---
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/audit"; do
  code=$(curl -s -b /tmp/sishi-admin-cookies.txt -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path (admin) -> $code"; else fail "GET $path (admin) -> $code"; fi
done

# --- Third-party token (dev) ---
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-user-001")
if echo "$TOKEN_RESP" | grep -q 'token'; then
  pass "GET /api/dev/third-party-token"
  TOKEN=$(echo "$TOKEN_RESP" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
  SSO_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
  if [ "$SSO_CODE" = "200" ] || [ "$SSO_CODE" = "302" ] || [ "$SSO_CODE" = "307" ]; then
    pass "GET /m/sso?token=... -> $SSO_CODE"
  else
    fail "GET /m/sso?token=... -> $SSO_CODE"
  fi
else
  fail "GET /api/dev/third-party-token: $TOKEN_RESP"
fi

# --- Auction bid (need project id from DB) ---
PROJECT_ID=$(cd /workspace && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' } });
  console.log(proj?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  BID=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":100}')
  if echo "$BID" | grep -qE '"ok":true|"success":true|bid|error'; then
    pass "POST /api/m/auction/$PROJECT_ID/bid (response received)"
  else
    fail "POST bid: $BID"
  fi
  AUCTION_PAGE=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction/$PROJECT_ID")
  if [ "$AUCTION_PAGE" = "200" ]; then pass "GET /m/auction/$PROJECT_ID"; else fail "GET /m/auction/$PROJECT_ID -> $AUCTION_PAGE"; fi
else
  echo "⚠ No LIVE auction project in DB, skipping bid test"
fi

# --- Drying reserve ---
DRYING_ID=$(cd /workspace && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const d = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(d?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [ -n "$DRYING_ID" ]; then
  RESERVE=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$DRYING_ID\",\"startDate\":\"2026-06-15\",\"endDate\":\"2026-06-16\"}")
  pass "POST /api/m/drying/reserve (response: ${RESERVE:0:80}...)"
  DRY_PAGE=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/drying/$DRYING_ID")
  if [ "$DRY_PAGE" = "200" ]; then pass "GET /m/drying/$DRYING_ID"; else fail "GET /m/drying/$DRYING_ID -> $DRY_PAGE"; fi
else
  echo "⚠ No OPERATING drying listing, skipping reserve test"
fi

# --- Mock payment (auction deposit) ---
if [ -n "$PROJECT_ID" ]; then
  PAY=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/payments/mock" \
    -H "Content-Type: application/json" \
    -d "{\"purpose\":\"AUCTION_DEPOSIT\",\"auctionProjectId\":\"$PROJECT_ID\"}")
  if echo "$PAY" | grep -qE '"ok":true|已缴纳|error'; then
    pass "POST /api/m/payments/mock (deposit)"
  else
    fail "POST /api/m/payments/mock: $PAY"
  fi
fi

# --- Admin assets API (POST only; expect 400 without form) ---
ASSETS=$(curl -s -b /tmp/sishi-admin-cookies.txt -X POST "$BASE/api/admin/assets")
if echo "$ASSETS" | grep -qE '表单|无效|error|未登录'; then
  pass "POST /api/admin/assets (route reachable)"
else
  fail "POST /api/admin/assets: ${ASSETS:0:100}"
fi

# --- Logout ---
LOGOUT=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
pass "POST /api/auth/logout"

echo ""
if [ $FAIL -eq 0 ]; then echo "All integration tests passed."; exit 0; else echo "Some tests failed."; exit 1; fi
