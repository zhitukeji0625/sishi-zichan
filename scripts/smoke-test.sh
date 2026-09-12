#!/usr/bin/env bash
# API smoke tests — requires dev server at BASE_URL (default http://localhost:3000)
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

pass() { echo "✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "✗ $1"; FAIL=$((FAIL + 1)); }

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "=== Smoke test @ $BASE ==="

# Pages
for path in / /admin/login /m/login /m /m/auction /m/drying; do
  c=$(code "$BASE$path")
  [ "$c" = "200" ] && pass "GET $path" || fail "GET $path (got $c)"
done

# Admin login
curl -s -c /tmp/smoke-admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' | grep -q '"ok":true' \
  && pass "Admin login" || fail "Admin login"

for path in /admin /admin/assets /admin/auctions; do
  c=$(code -b /tmp/smoke-admin.txt "$BASE$path")
  [ "$c" = "200" ] && pass "GET $path (auth)" || fail "GET $path (got $c)"
done

# User login
curl -s -c /tmp/smoke-user.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' | grep -q '"ok":true' \
  && pass "User login" || fail "User login"

# Third-party token
curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test" | grep -q '"token"' \
  && pass "Dev third-party token" || fail "Dev third-party token"

# Non-multipart upload → 400
UP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke-admin.txt \
  -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')
[ "$UP_CODE" = "400" ] && pass "Upload rejects non-multipart ($UP_CODE)" || fail "Upload non-multipart (got $UP_CODE)"

# Non-multipart asset create → 400
AS_CODE=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke-admin.txt \
  -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{}')
[ "$AS_CODE" = "400" ] && pass "Asset POST rejects non-multipart ($AS_CODE)" || fail "Asset POST non-multipart (got $AS_CODE)"

# Auction bid (dynamic min from DB)
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } })
  .then(r => {
    if (!r) { console.log(''); return; }
    const top = r.bids[0]?.amount ? Number(r.bids[0].amount) : Number(r.startPrice);
    const step = Number(r.bidStep);
    const min = r.bids.length ? top + step : top;
    console.log(r.id + ' ' + min);
    p.\$disconnect();
  });
" 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  PID=$(echo "$PROJECT_ID" | awk '{print $1}')
  MIN=$(echo "$PROJECT_ID" | awk '{print $2}')
  BID=$(curl -s -b /tmp/smoke-user.txt -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN}")
  echo "$BID" | grep -q '"ok":true' && pass "Auction bid ($MIN)" || fail "Auction bid: $BID"
else
  fail "No LIVE auction project"
fi

# Drying reservation
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } })
  .then(r => { console.log(r?.id ?? ''); p.\$disconnect(); });
" 2>/dev/null | tail -1)

if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+10 days" +%Y-%m-%d 2>/dev/null || date -v+10d +%Y-%m-%d)
  END=$(date -d "+11 days" +%Y-%m-%d 2>/dev/null || date -v+11d +%Y-%m-%d)
  DRY=$(curl -s -b /tmp/smoke-user.txt -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  echo "$DRY" | grep -q '"ok":true' && pass "Drying reservation" || fail "Drying reservation: $DRY"
else
  fail "No operating drying listing"
fi

# Register duplicate
REG=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123","name":"x"}')
echo "$REG" | grep -q 'error' && pass "Duplicate register rejected" || fail "Duplicate register"

# New user register
NEW_PHONE="199$(date +%s | tail -c 9)"
REG2=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$NEW_PHONE\",\"password\":\"test1234\",\"name\":\"冒烟\"}")
echo "$REG2" | grep -q '"ok":true' && pass "New user register" || fail "New user register: $REG2"

# Protected route redirect
REDIR=$(code "$BASE/admin/assets")
[ "$REDIR" = "307" ] || [ "$REDIR" = "302" ] && pass "Admin unauth redirect ($REDIR)" || fail "Admin unauth (got $REDIR)"

# Auth pages
for path in /m/me /m/orders; do
  c=$(code -b /tmp/smoke-user.txt "$BASE$path")
  [ "$c" = "200" ] && pass "GET $path (user)" || fail "GET $path (got $c)"
done

echo ""
echo "=== Result: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
