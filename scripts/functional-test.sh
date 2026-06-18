#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
ADMIN_JAR="${TMPDIR:-/tmp}/sishi_admin_cookies.txt"
USER_JAR="${TMPDIR:-/tmp}/sishi_user_cookies.txt"
PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; echo "  $2"; FAIL=$((FAIL + 1)); }

check_http() {
  local name="$1" url="$2" expect="$3"
  shift 3
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$@" "$url")
  if [ "$code" = "$expect" ]; then pass "$name"; else fail "$name" "expected HTTP $expect, got $code"; fi
}

check_body() {
  local name="$1" expect="$2"
  shift 2
  local out
  out=$("$@")
  if echo "$out" | grep -q "$expect"; then pass "$name"; else fail "$name" "output: $out"; fi
}

echo "=== Functional smoke tests against $BASE ==="

check_http "home page" "$BASE/" "200"
check_http "admin login page" "$BASE/admin/login" "200"
check_http "mobile home" "$BASE/m" "200"
check_http "auction list" "$BASE/m/auction" "200"
check_http "drying list" "$BASE/m/drying" "200"

rm -f "$ADMIN_JAR"
check_body "admin login" '"ok":true' \
  curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}'

check_http "admin dashboard" "$BASE/admin" "200" -b "$ADMIN_JAR"
for path in /admin/assets /admin/auctions /admin/drying /admin/dict /admin/announcements /admin/organizations /admin/registrations /admin/audit /admin/config /admin/admins; do
  check_http "admin page $path" "$BASE$path" "200" -b "$ADMIN_JAR"
done

rm -f "$USER_JAR"
check_body "user login" '"ok":true' \
  curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}'

for path in /m/me /m/orders; do
  check_http "mobile page $path" "$BASE$path" "200" -b "$USER_JAR"
done

check_body "third party token" "token" curl -s "$BASE/api/dev/third-party-token?u_id=test123"
check_body "bid without auth" "请先登录" \
  curl -s -X POST "$BASE/api/m/auction/test/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":100}'

IDS=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const project = await p.auctionProject.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, startPrice: true, bidStep: true },
  });
  const listing = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } });
  const dictCount = await p.dictCategory.count();
  if (!project || !listing) process.exit(1);
  const topBid = await p.auctionBid.findFirst({
    where: { projectId: project.id },
    orderBy: { amount: 'desc' },
    select: { amount: true },
  });
  const minBid = topBid
    ? Number(topBid.amount) + Number(project.bidStep)
    : Number(project.startPrice);
  console.log([project.id, project.status, minBid, listing.id, dictCount].join('|'));
}
main().finally(() => p.\$disconnect());
")

PROJECT_ID=$(echo "$IDS" | cut -d'|' -f1)
AUCTION_STATUS=$(echo "$IDS" | cut -d'|' -f2)
BID_AMOUNT=$(echo "$IDS" | cut -d'|' -f3)
LISTING_ID=$(echo "$IDS" | cut -d'|' -f4)
DICT_COUNT=$(echo "$IDS" | cut -d'|' -f5)

if [ "$AUCTION_STATUS" = "LIVE" ]; then pass "demo auction is LIVE"; else fail "demo auction is LIVE" "status=$AUCTION_STATUS"; fi
if [ "$DICT_COUNT" -gt 0 ]; then pass "dict categories seeded"; else fail "dict categories seeded" "count=$DICT_COUNT"; fi

check_http "auction detail" "$BASE/m/auction/$PROJECT_ID" "200" -b "$USER_JAR"
check_http "drying detail" "$BASE/m/drying/$LISTING_ID" "200" -b "$USER_JAR"

BID_OUT=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
  -H "Content-Type: application/json" \
  -d "{\"amount\":$BID_AMOUNT}")
if echo "$BID_OUT" | grep -q '"ok":true'; then
  pass "place bid"
else
  fail "place bid" "output: $BID_OUT"
fi

START_DATE=$(node -e "const d=new Date(); d.setDate(d.getDate()+3); console.log(d.toISOString().slice(0,10))")
END_DATE=$(node -e "const d=new Date(); d.setDate(d.getDate()+5); console.log(d.toISOString().slice(0,10))")
RESERVE_OUT=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
if echo "$RESERVE_OUT" | grep -q '"ok":true'; then
  pass "drying reservation"
else
  fail "drying reservation" "output: $RESERVE_OUT"
fi

check_http "sso page" "$BASE/m/sso?token=invalid" "200"

echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then exit 1; fi
