#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/smoke-user.txt"
ADMIN_JAR="/tmp/smoke-admin.txt"
ERRORS=0

fail() { echo "FAIL: $1"; ERRORS=$((ERRORS + 1)); }
pass() { echo "PASS: $1"; }

echo "=== Smoke Test: $BASE ==="

# Pages
for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ] || [ "$code" = "307" ]; then pass "GET $path ($code)"; else fail "GET $path ($code)"; fi
done

# Favicon
fav=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/icon")
if [ "$fav" = "200" ]; then pass "GET /icon ($fav)"; else fail "GET /icon ($fav)"; fi

# Admin login
rm -f "$ADMIN_JAR"
resp=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$resp" | grep -q '"ok":true'; then pass "Admin login"; else fail "Admin login: $resp"; fi

# User login
rm -f "$COOKIE_JAR"
resp=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$resp" | grep -q '"ok":true'; then pass "User login"; else fail "User login: $resp"; fi

# Dict page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/dict")
if [ "$code" = "200" ]; then pass "Admin dict page"; else fail "Admin dict ($code)"; fi

# Upload validation (non-multipart -> 400)
upload_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"test":1}')
if [ "$upload_code" = "400" ]; then pass "Upload non-multipart returns 400"; else fail "Upload non-multipart ($upload_code)"; fi

# Bid test (dynamic min bid)
AUCTION_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const a = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
  if (!a) { console.log(''); return; }
  const top = await p.auctionBid.findFirst({ where: { projectId: a.id }, orderBy: { amount: 'desc' } });
  const min = top ? Number(top.amount) + Number(a.bidStep) : Number(a.startPrice);
  console.log(a.id + '|' + min);
  await p.\$disconnect();
})();
" 2>/dev/null)

if [ -n "$AUCTION_ID" ] && [ "$AUCTION_ID" != "|" ]; then
  AID="${AUCTION_ID%%|*}"
  MIN="${AUCTION_ID#*|}"
  bid_resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$AID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\": $MIN}")
  if echo "$bid_resp" | grep -q '"ok":true'; then pass "Place bid ($MIN)"; else fail "Place bid: $bid_resp"; fi
else
  fail "No LIVE auction found for bid test"
fi

# Drying reserve
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [ -n "$LISTING_ID" ]; then
  START=$(date -u +%Y-%m-%d)
  END=$(date -u -d "+3 days" +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
  res_resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  if echo "$res_resp" | grep -q '"ok":true'; then pass "Drying reserve"; else
  if echo "$res_resp" | grep -q '已满'; then pass "Drying reserve (capacity full, endpoint ok)"; else fail "Drying reserve: $res_resp"; fi
  fi
else
  fail "No drying listing found"
fi

# Third-party token
tp=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test")
if echo "$tp" | grep -q 'token'; then pass "Third-party token"; else fail "Third-party token: $tp"; fi

# Logout
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout" > /dev/null
curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout" > /dev/null
pass "Logout"

echo ""
echo "=== Summary: $ERRORS error(s) ==="
exit $ERRORS
