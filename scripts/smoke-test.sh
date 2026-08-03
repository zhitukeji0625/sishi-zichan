#!/usr/bin/env bash
set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/smoke-admin-cookies.txt"
USER_COOKIE="/tmp/smoke-user-cookies.txt"
PASS=0
FAIL=0
ERRORS=""

pass() { PASS=$((PASS+1)); echo "✓ $1"; }
fail() { FAIL=$((FAIL+1)); ERRORS="${ERRORS}\n✗ $1: $2"; echo "✗ $1: $2"; }

rm -f "$COOKIE_JAR" "$USER_COOKIE"

# Static pages
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
[ "$code" = "200" ] && pass "GET /" || fail "GET /" "status=$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
[ "$code" = "200" ] && pass "GET /admin/login" || fail "GET /admin/login" "status=$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")
[ "$code" = "200" ] && pass "GET /m/login" || fail "GET /m/login" "status=$code"

# Admin auth
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"wrong"}')
code=$(echo "$resp" | tail -1)
[ "$code" = "401" ] && pass "POST admin login wrong pwd" || fail "POST admin login wrong pwd" "status=$code"

resp=$(curl -s -c "$COOKIE_JAR" -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
[ "$code" = "200" ] && pass "POST admin login" || fail "POST admin login" "status=$code"

code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin")
[ "$code" = "200" ] && pass "GET /admin (authenticated)" || fail "GET /admin (authenticated)" "status=$code"

resp=$(curl -s -b "$COOKIE_JAR" -w "\n%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
code=$(echo "$resp" | tail -1)
[ "$code" = "400" ] && pass "POST upload non-multipart returns 400" || fail "POST upload non-multipart" "status=$code"

resp=$(curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/logout")
code=$(echo "$resp" | tail -1)
[ "$code" = "200" ] && pass "POST admin logout" || fail "POST admin logout" "status=$code"

# User auth
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')
code=$(echo "$resp" | tail -1)
[ "$code" = "401" ] && pass "POST user login wrong pwd" || fail "POST user login wrong pwd" "status=$code"

resp=$(curl -s -c "$USER_COOKIE" -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
[ "$code" = "200" ] && pass "POST user login" || fail "POST user login" "status=$code"

code=$(curl -s -b "$USER_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/m/me")
[ "$code" = "200" ] && pass "GET /m/me" || fail "GET /m/me" "status=$code"

code=$(curl -s -b "$USER_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/m/auction")
[ "$code" = "200" ] && pass "GET /m/auction" || fail "GET /m/auction" "status=$code"

# Dev-only third-party token (skip in production)
if [ "${NODE_ENV:-development}" != "production" ]; then
  resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke-test")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  if [ "$code" = "200" ] && echo "$body" | grep -q "token"; then
    pass "GET dev third-party-token"
    TOKEN=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null || echo "")
    if [ -n "$TOKEN" ]; then
      resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/third-party" \
        -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
      code=$(echo "$resp" | tail -1)
      [ "$code" = "200" ] && pass "POST third-party SSO" || fail "POST third-party SSO" "status=$code"
    else
      fail "POST third-party SSO" "no token parsed"
    fi
  else
    fail "GET dev third-party-token" "status=$code body=$body"
  fi
else
  pass "SKIP dev third-party-token (production)"
  pass "SKIP third-party SSO (production)"
fi

# Protected API without auth
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -d '{}')
code=$(echo "$resp" | tail -1)
[ "$code" = "401" ] || [ "$code" = "403" ] && pass "POST drying reserve unauth blocked" || fail "POST drying reserve unauth" "status=$code"

# Auction bid (requires LIVE project in DB)
AUCTION_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } });
  console.log(proj?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [ -n "$AUCTION_ID" ]; then
  code=$(curl -s -b "$USER_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/m/auction/$AUCTION_ID")
  [ "$code" = "200" ] && pass "GET /m/auction/[id]" || fail "GET /m/auction/[id]" "status=$code"

  resp=$(curl -s -b "$USER_COOKIE" -w "\n%{http_code}" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":999999}')
  code=$(echo "$resp" | tail -1)
  [ "$code" = "200" ] || [ "$code" = "400" ] && pass "POST bid (status=$code)" || fail "POST bid" "status=$code"
else
  fail "Auction tests" "no LIVE auction — run npm run db:seed"
fi

# Drying reservation
code=$(curl -s -b "$USER_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/m/drying")
[ "$code" = "200" ] && pass "GET /m/drying" || fail "GET /m/drying" "status=$code"

DRYING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const listing = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } });
  console.log(listing?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [ -n "$DRYING_ID" ]; then
  code=$(curl -s -b "$USER_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/m/drying/$DRYING_ID")
  [ "$code" = "200" ] && pass "GET /m/drying/[id]" || fail "GET /m/drying/[id]" "status=$code"

  START=$(date -d "+30 days" +%Y-%m-%d 2>/dev/null || date -v+30d +%Y-%m-%d)
  END=$(date -d "+33 days" +%Y-%m-%d 2>/dev/null || date -v+33d +%Y-%m-%d)
  resp=$(curl -s -b "$USER_COOKIE" -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$DRYING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$resp" | tail -1)
  [ "$code" = "200" ] || [ "$code" = "409" ] && pass "POST drying reserve (status=$code)" || fail "POST drying reserve" "status=$code body=$(echo "$resp" | head -n -1)"

  resp=$(curl -s -b "$USER_COOKIE" -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$DRYING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$resp" | tail -1)
  [ "$code" = "409" ] && pass "POST overlapping drying reserve returns 409" || fail "POST overlapping drying reserve" "status=$code"
else
  fail "Drying tests" "no OPERATING drying listing"
fi

# Register validation
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" -d '{"phone":"invalid","password":"123"}')
code=$(echo "$resp" | tail -1)
[ "$code" = "400" ] && pass "POST register invalid data returns 400" || fail "POST register invalid" "status=$code"

echo ""
echo "========== RESULTS =========="
echo "PASS: $PASS  FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo -e "$ERRORS"
  exit 1
fi
