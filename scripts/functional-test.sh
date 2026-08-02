#!/usr/bin/env bash
# Functional smoke + API tests. Requires dev server on :3000 and seeded DB.
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/ft-user-cookies.txt"
ADMIN_JAR="/tmp/ft-admin-cookies.txt"
rm -f "$COOKIE_JAR" "$ADMIN_JAR"

pass() { echo "✓ $1"; PASS=$((PASS+1)); }
fail() { echo "✗ $1 (got: $2)"; FAIL=$((FAIL+1)); }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name"; else fail "$name" "$actual"; fi
}

echo "=== Seeding database ==="
npm run db:seed >/dev/null

echo "=== Page smoke tests ==="
for path in "/" "/admin/login" "/m" "/m/login" "/m/auction" "/m/drying" "/m/me" "/m/orders"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

echo ""
echo "=== Auth API tests ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{}')
check_status "POST /api/auth/login empty" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')
check_status "POST /api/auth/login wrong password" "401" "$code"

LOGIN_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
if echo "$LOGIN_RESP" | grep -q '"ok":true'; then pass "POST /api/auth/login success"; else fail "POST /api/auth/login success" "$LOGIN_RESP"; fi

code=$(curl -s -o /dev/null -w "%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check_status "POST /api/auth/admin/login" "200" "$code"

echo ""
echo "=== Protected route tests ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/test/bid" -H "Content-Type: application/json" -d '{"amount":100}')
check_status "POST bid without login" "401" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')
check_status "POST /api/upload without auth" "401" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')
check_status "POST /api/upload no multipart" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{}')
check_status "POST /api/admin/assets no multipart" "400" "$code"

echo ""
echo "=== Auction bid test ==="
PROJECT_ID=$(node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } });
if (!proj) { console.log(''); await p.\$disconnect(); process.exit(0); }
const top = proj.bids[0]?.amount ? Number(proj.bids[0].amount) : Number(proj.startPrice);
const next = top + Number(proj.bidStep);
console.log(proj.id + ' ' + next);
await p.\$disconnect();
")

if [ -n "$PROJECT_ID" ]; then
  PID=$(echo "$PROJECT_ID" | awk '{print $1}')
  AMOUNT=$(echo "$PROJECT_ID" | awk '{print $2}')
  BID_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PID/bid" -H "Content-Type: application/json" -d "{\"amount\":$AMOUNT}")
  if echo "$BID_RESP" | grep -q '"ok":true'; then pass "POST auction bid"; else fail "POST auction bid" "$BID_RESP"; fi

  BAD_AMOUNT=$((AMOUNT - 50))
  BID_FAIL=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PID/bid" -H "Content-Type: application/json" -d "{\"amount\":$BAD_AMOUNT}")
  check_status "POST auction bid below min increment" "400" "$BID_FAIL"
else
  fail "find LIVE auction project" "not found"
fi

echo ""
echo "=== Drying reservation test ==="
LISTING_ID=$(node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
console.log(l?.id ?? '');
await p.\$disconnect();
")

if [ -n "$LISTING_ID" ]; then
  START=$(date -u -d "+20 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+20d +%Y-%m-%dT00:00:00.000Z)
  END=$(date -u -d "+21 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+21d +%Y-%m-%dT00:00:00.000Z)
  RESERVE_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  if echo "$RESERVE_RESP" | grep -q '"ok":true'; then pass "POST drying reserve"; else fail "POST drying reserve" "$RESERVE_RESP"; fi

  OVERLAP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check_status "POST drying overlap rejected" "409" "$OVERLAP_CODE"
else
  fail "find OPERATING drying listing" "not found"
fi

echo ""
echo "=== Third-party token test ==="
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-user-001")
if echo "$TOKEN_RESP" | grep -q 'token'; then pass "GET third-party-token"; else fail "GET third-party-token" "$TOKEN_RESP"; fi

echo ""
echo "=== Admin pages (authenticated) ==="
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/dict"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  check_status "GET $path (admin)" "200" "$code"
done

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
