#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
FAIL=0

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

require_code() {
  local method="$1" url="$2" expect="$3" extra="${4:-}"
  local code
  code=$(eval "curl -s -o /dev/null -w '%{http_code}' $extra -X $method '$BASE$url'")
  if [ "$code" = "$expect" ]; then pass "$method $url → $code"; else fail "$method $url expected $expect got $code"; fi
}

echo "=== Smoke test @ $BASE ==="

for path in / /m /m/login /m/auction /m/drying /admin/login; do
  require_code GET "$path" 200
done

USER_LOGIN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$USER_LOGIN" | grep -q '"ok":true' && pass "user login" || fail "user login: $USER_LOGIN"

curl -s -c /tmp/smoke_admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}' | grep -q '"ok":true' \
  && pass "admin login" || fail "admin login"

UP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/smoke_admin.txt \
  -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')
[ "$UP_CODE" = "400" ] && pass "upload non-multipart 400" || fail "upload non-multipart got $UP_CODE"

AS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/smoke_admin.txt \
  -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{}')
[ "$AS_CODE" = "400" ] && pass "admin assets non-multipart 400" || fail "admin assets non-multipart got $AS_CODE"

PHONE="199$(date +%s | tail -c 9)"
REG=$(curl -s -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟\"}")
echo "$REG" | grep -q '"ok":true' && pass "register" || fail "register: $REG"

TP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke")
echo "$TP" | grep -q 'token' && pass "third-party-token" || fail "third-party-token: $TP"

curl -s -c /tmp/smoke_user.txt -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}' > /dev/null

read -r PROJECT_ID MIN_BID LISTING_ID <<EOF
$(cd "$(dirname "$0")/.." && node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
const p = new PrismaClient();
const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { endsAt: 'desc' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } });
const listing = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
let min = '';
if (proj) {
  const top = proj.bids[0]?.amount;
  min = top ? new Decimal(top).plus(proj.bidStep).toString() : String(proj.startPrice);
}
console.log([proj?.id ?? '', min, listing?.id ?? ''].join(' '));
await p.\$disconnect();
")
EOF

if [ -n "$PROJECT_ID" ] && [ -n "$MIN_BID" ]; then
  BID=$(curl -s -w "\n%{http_code}" -b /tmp/smoke_user.txt \
    -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' \
    -d "{\"amount\":$MIN_BID}")
  BID_CODE=$(echo "$BID" | tail -1)
  [ "$BID_CODE" = "200" ] && pass "place bid $MIN_BID" || fail "place bid $BID_CODE $(echo "$BID" | head -1)"
else
  fail "no LIVE auction project"
fi

if [ -n "$LISTING_ID" ]; then
  START=$(date -d '+3 days' +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d '+4 days' +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  DR=$(curl -s -w "\n%{http_code}" -b /tmp/smoke_user.txt \
    -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  DR_CODE=$(echo "$DR" | tail -1)
  [ "$DR_CODE" = "200" ] && pass "drying reserve" || fail "drying reserve $DR_CODE $(echo "$DR" | head -1)"
else
  fail "no drying listing"
fi

echo "=== Done: $FAIL failure(s) ==="
exit "$FAIL"
