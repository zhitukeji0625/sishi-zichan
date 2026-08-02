#!/usr/bin/env bash
# Functional smoke + API flow tests for sishi-zichan
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/ft_user_cookies.txt"
ADMIN_COOKIE="/tmp/ft_admin_cookies.txt"
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

rm -f "$COOKIE_JAR" "$ADMIN_COOKIE"

echo "=== Functional tests against $BASE ==="

# --- Public pages ---
for path in / /m /m/login /m/register /admin/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path"; else fail "GET $path (HTTP $code)"; fi
done

# --- User login ---
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$LOGIN" | grep -q '"ok":true'; then pass "user login"; else fail "user login: $LOGIN"; fi

# --- Admin login ---
ADMIN_LOGIN=$(curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ADMIN_LOGIN" | grep -q '"ok":true'; then pass "admin login"; else fail "admin login: $ADMIN_LOGIN"; fi

# --- Authenticated mobile pages ---
for path in /m /m/auction /m/drying /m/me /m/orders; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path (user)"; else fail "GET $path (user) HTTP $code"; fi
done

# --- Admin pages ---
for path in /admin /admin/assets /admin/auctions /admin/drying /admin/announcements \
  /admin/organizations /admin/admins /admin/audit /admin/config /admin/dict /admin/registrations; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path (admin)"; else fail "GET $path (admin) HTTP $code"; fi
done

# --- Third-party token (dev) ---
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=ft_test_user")
TOKEN=$(echo "$TOKEN_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || true)
if [ -n "$TOKEN" ]; then pass "dev third-party token"; else fail "dev third-party token: $TOKEN_RESP"; fi

# SSO replaces session — re-login demo user for bid tests
curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' > /dev/null

# --- Reset auction to LIVE for bid test ---
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const now = new Date();
  const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await p.auctionProject.updateMany({ data: { status: 'LIVE', startsAt: now, endsAt: ends } });
  const proj = await p.auctionProject.findFirst();
  console.log(proj?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  # Compute min bid
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient, Decimal } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const proj = await p.auctionProject.findFirst();
  if (!proj) { console.log('8000'); return; }
  const top = await p.auctionBid.findFirst({ where: { projectId: proj.id }, orderBy: { amount: 'desc' } });
  const minNext = top
    ? new Decimal(top.amount.toString()).plus(proj.bidStep.toString())
    : new Decimal(proj.startPrice.toString());
  console.log(minNext.toFixed(2));
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

  BID=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  if echo "$BID" | grep -q '"ok":true'; then pass "place bid ($MIN_BID)"; else fail "place bid: $BID"; fi
else
  fail "no auction project in DB"
fi

# --- Drying reservation ---
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dryingFieldListing.findFirst().then(r => { console.log(r?.id ?? ''); p.\$disconnect(); });
" 2>/dev/null | tail -1)

if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  RESERVE=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  if echo "$RESERVE" | grep -q '"ok":true'; then pass "drying reserve"; else fail "drying reserve: $RESERVE"; fi
else
  fail "no drying listing in DB"
fi

# --- Register (unique 11-digit phone per run) ---
RAND_PHONE="1$(printf '%010d' $((RANDOM * 100000 + RANDOM % 100000)))"
REG=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$RAND_PHONE\",\"password\":\"test123456\",\"name\":\"功能测试\"}")
if echo "$REG" | grep -q '"ok":true'; then pass "user register"; else fail "user register: $REG"; fi

# --- API error handling: non-multipart should be 400 not 500 ---
for endpoint in /api/upload /api/admin/assets; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE$endpoint" \
    -H "Content-Type: application/json" -d '{"name":"test"}')
  if [ "$code" = "400" ]; then pass "POST $endpoint invalid body -> 400"; else fail "POST $endpoint invalid body -> HTTP $code (want 400)"; fi
done

ASSET_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.asset.findFirst().then(r => { console.log(r?.id ?? ''); p.\$disconnect(); });
" 2>/dev/null | tail -1)
if [ -n "$ASSET_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/admin/assets/$ASSET_ID" \
    -H "Content-Type: application/json" -d '{"name":"test"}')
  if [ "$code" = "400" ]; then pass "POST /api/admin/assets/[id] invalid body -> 400"; else fail "POST /api/admin/assets/[id] -> HTTP $code"; fi
fi

# --- Upload wrong file type -> 400 ---
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/upload" \
  -F "file=@$(dirname "$0")/../README.md")
if [ "$code" = "400" ]; then pass "upload non-image -> 400"; else fail "upload non-image -> HTTP $code"; fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then exit 1; fi
