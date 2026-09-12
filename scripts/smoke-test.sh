#!/bin/bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/smoke-cookies.txt"
ADMIN_JAR="/tmp/smoke-admin-cookies.txt"
rm -f "$COOKIE_JAR" "$ADMIN_JAR"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

check_contains() {
  local name="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "✓ $name"
    PASS=$((PASS+1))
  else
    echo "✗ $name (missing: $needle)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Public Pages ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

echo ""
echo "=== Auth APIs ==="
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
check "POST /api/auth/login (demo user)" "200" "$code"
check_contains "login response ok" '"ok":true' "$body"

resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
check "POST /api/auth/admin/login" "200" "$code"
check_contains "admin login ok" '"ok":true' "$body"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
check "POST /api/auth/login (bad password)" "401" "$code"

PHONE="199$(date +%s | tail -c 9)"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
check "POST /api/auth/register" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{}')
check "POST /api/auth/login (empty)" "400" "$code"

echo ""
echo "=== Upload/Asset APIs (non-multipart → 400) ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"test":true}')
check "POST /api/upload (non-multipart)" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"test":true}')
check "POST /api/admin/assets (non-multipart)" "400" "$code"

echo ""
echo "=== Auction Bid API ==="
read -r PROJECT_ID MIN_BID < <(cd "$(dirname "$0")/.." && node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } });
if (!proj) { console.log(''); process.exit(0); }
const top = proj.bids[0]?.amount;
const min = top ? Number(top) + Number(proj.bidStep) : Number(proj.startPrice);
console.log(proj.id, min);
await p.\$disconnect();
")

if [ -n "$PROJECT_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')
  check "POST /api/m/auction/bid" "200" "$code"
  if [ "$code" != "200" ]; then echo "  body: $body"; fi

  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":-1}')
  check "POST bid (invalid amount)" "400" "$code"
else
  echo "✗ No LIVE auction project found"
  FAIL=$((FAIL+2))
fi

echo ""
echo "=== Drying Reserve API ==="
LISTING_ID=$(cd "$(dirname "$0")/.." && node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
console.log(l?.id ?? '');
await p.\$disconnect();
")

if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')
  check "POST /api/m/drying/reserve" "200" "$code"
  if [ "$code" != "200" ]; then echo "  body: $body"; fi
else
  echo "✗ No OPERATING drying listing found"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== Admin Pages ==="
for path in "/admin/login" "/admin" "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/dict"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "302" ]; then
    echo "✓ GET $path ($code)"
    PASS=$((PASS+1))
  else
    echo "✗ GET $path ($code)"
    FAIL=$((FAIL+1))
  fi
done

echo ""
echo "=== Logout ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
check "POST /api/auth/logout" "200" "$code"

echo ""
echo "=============================="
echo "PASSED: $PASS  FAILED: $FAIL"
echo "=============================="
[ "$FAIL" -eq 0 ]
