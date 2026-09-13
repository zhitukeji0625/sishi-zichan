#!/usr/bin/env bash
# API smoke tests — run against a live dev server (npm run dev).
set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/smoke_user_cookies.txt"
ADMIN_JAR="/tmp/smoke_admin_cookies.txt"
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; }

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

echo "=== Smoke tests @ $BASE ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
[ "$code" = "200" ] && pass "GET /" || fail "GET / (HTTP $code)"

# 2. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
[ "$code" = "200" ] && pass "GET /admin/login" || fail "GET /admin/login (HTTP $code)"

# 3. Mobile login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")
[ "$code" = "200" ] && pass "GET /m/login" || fail "GET /m/login (HTTP $code)"

# 4. User login
resp=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$resp" | grep -q '"ok":true' && pass "POST /api/auth/login" || fail "POST /api/auth/login: $resp"

# 5. Admin login
resp=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$resp" | grep -q '"ok":true' && pass "POST /api/auth/admin/login" || fail "POST /api/auth/admin/login: $resp"

# 6. Bad login
resp=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
echo "$resp" | grep -q '"error"' && pass "POST /api/auth/login (bad password)" || fail "bad login: $resp"

# 7. Mobile pages (authenticated)
for path in /m /m/auction /m/drying /m/me /m/orders; do
  code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE$path")
  [ "$code" = "200" ] && pass "GET $path" || fail "GET $path (HTTP $code)"
done

# 8. Admin pages (authenticated)
for path in /admin /admin/assets /admin/auctions /admin/drying /admin/registrations; do
  code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE$path")
  [ "$code" = "200" ] && pass "GET $path" || fail "GET $path (HTTP $code)"
done

# 9. Third-party token (dev)
resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test")
echo "$resp" | grep -q '"token"' && pass "GET /api/dev/third-party-token" || fail "third-party token: $resp"

# 10. Third-party auth
TOKEN=$(echo "$resp" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
resp=$(curl -s -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
echo "$resp" | grep -q '"ok":true' && pass "POST /api/auth/third-party" || fail "third-party auth: $resp"

# 11. Register new user
RAND_PHONE="199$(date +%s | tail -c 9)"
resp=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$RAND_PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
echo "$resp" | grep -q '"ok":true' && pass "POST /api/auth/register" || fail "register: $resp"

# 12. Duplicate register
resp=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"test1234","name":"重复"}')
echo "$resp" | grep -q '"error"' && pass "POST /api/auth/register (duplicate)" || fail "duplicate register: $resp"

# 13. Upload without multipart → 400
code=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}' -o /dev/null -w "%{http_code}")
[ "$code" = "400" ] && pass "POST /api/upload (non-multipart → 400)" || fail "upload non-multipart (HTTP $code)"

# 14. Admin assets without multipart → 400
code=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}' -o /dev/null -w "%{http_code}")
[ "$code" = "400" ] && pass "POST /api/admin/assets (non-multipart → 400)" || fail "assets non-multipart (HTTP $code)"

# 15. Drying reservation
LISTING_ID=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dryingFieldListing.findFirst().then(r => { console.log(r?.id || ''); p.\$disconnect(); });
")
START=$(date -d "+10 days" +%Y-%m-%d 2>/dev/null || date -v+10d +%Y-%m-%d)
END=$(date -d "+11 days" +%Y-%m-%d 2>/dev/null || date -v+11d +%Y-%m-%d)
if [ -n "$LISTING_ID" ]; then
  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  echo "$resp" | grep -q '"ok":true' && pass "POST /api/m/drying/reserve" || fail "drying reserve: $resp"
else
  fail "no drying listing in DB"
fi

# 16-18. Auction bidding on LIVE project
BID_INFO=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const project = await p.auctionProject.findFirst({
    where: { status: 'LIVE' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!project) { console.log('NO_LIVE'); return; }
  const top = project.bids[0]?.amount;
  const minBid = top
    ? Number(top.toString()) + Number(project.bidStep.toString())
    : Number(project.startPrice.toString());
  console.log('PROJECT_ID=' + project.id);
  console.log('MIN_BID=' + minBid);
}
main().finally(() => p.\$disconnect());
")
PROJECT_ID=$(echo "$BID_INFO" | grep PROJECT_ID | cut -d= -f2)
MIN_BID=$(echo "$BID_INFO" | grep MIN_BID | cut -d= -f2)
if [ -n "$PROJECT_ID" ]; then
  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\": $MIN_BID}")
  echo "$resp" | grep -q '"ok":true' && pass "POST /api/m/auction/bid (valid)" || fail "bid valid: $resp"

  LOW=$((MIN_BID - 1))
  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\": $LOW}")
  echo "$resp" | grep -q '"error"' && pass "POST /api/m/auction/bid (too low)" || fail "bid too low: $resp"

  code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction/$PROJECT_ID")
  [ "$code" = "200" ] && pass "GET /m/auction/[id]" || fail "GET /m/auction/$PROJECT_ID (HTTP $code)"
else
  fail "no LIVE auction project"
  fail "bid valid (skipped)"
  fail "bid too low (skipped)"
fi

# 19. Unauthenticated API → 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"x","startDate":"2026-09-20","endDate":"2026-09-21"}')
[ "$code" = "401" ] && pass "POST /api/m/drying/reserve (unauth → 401)" || fail "unauth reserve (HTTP $code)"

# 20. Mock payment bad params → 400
resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/payments/mock" \
  -H "Content-Type: application/json" \
  -d '{"type":"INVALID"}')
echo "$resp" | grep -q '"error"' && pass "POST /api/m/payments/mock (bad params)" || fail "mock payment: $resp"

# 21. Admin unauthenticated → redirect
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
[ "$code" = "307" ] || [ "$code" = "302" ] && pass "GET /admin/assets (unauth redirect)" || fail "admin unauth (HTTP $code)"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
