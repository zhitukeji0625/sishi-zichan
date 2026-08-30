#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1" expect="$2" actual="$3"
  if [ "$actual" = "$expect" ]; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expect, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

USER_COOKIE=$(mktemp)
ADMIN_COOKIE=$(mktemp)
trap 'rm -f "$USER_COOKIE" "$ADMIN_COOKIE"' EXIT

echo "=== Smoke test @ $BASE ==="

# Trigger layout cron (auction status + demo refresh)
curl -s -o /dev/null "$BASE/" || true

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "GET /" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
check "GET /m" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check "GET /admin/login" "200" "$code"

resp=$(curl -s -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$resp" | grep -q '"ok":true' && check "User login" "ok" "ok" || check "User login" "ok" "fail"

resp=$(curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$resp" | grep -q '"ok":true' && check "Admin login" "ok" "ok" || check "Admin login" "ok" "fail"

code=$(curl -s -b "$USER_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/m/auction")
check "GET /m/auction (logged in)" "200" "$code"

code=$(curl -s -b "$USER_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/m/drying")
check "GET /m/drying (logged in)" "200" "$code"

code=$(curl -s -b "$USER_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/m/me")
check "GET /m/me (logged in)" "200" "$code"

code=$(curl -s -b "$ADMIN_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/admin")
check "GET /admin dashboard" "200" "$code"

code=$(curl -s -b "$ADMIN_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/admin/dict")
check "GET /admin/dict" "200" "$code"

code=$(curl -s -b "$ADMIN_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
check "GET /admin/assets" "200" "$code"

code=$(curl -s -b "$ADMIN_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/admin/auctions")
check "GET /admin/auctions" "200" "$code"

code=$(curl -s -b "$ADMIN_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/admin/drying")
check "GET /admin/drying" "200" "$code"

resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-user-001")
echo "$resp" | grep -q '"token"' && check "Dev third-party token" "ok" "ok" || check "Dev third-party token" "ok" "fail"

DICT_COUNT=$(npx tsx -e 'import {PrismaClient} from "@prisma/client"; const p=new PrismaClient(); p.dictCategory.count().then(c=>{console.log(c);p.$disconnect()})' 2>/dev/null || echo 0)
if [ "${DICT_COUNT:-0}" -gt 0 ]; then
  check "Dict categories seeded" "ok" "ok"
else
  check "Dict categories seeded" "ok" "fail (count=$DICT_COUNT)"
fi

AUCTION_JSON=$(npx tsx -e 'import {PrismaClient} from "@prisma/client"; const p=new PrismaClient(); p.auctionProject.findFirst({where:{status:"LIVE"},select:{id:true,bidStep:true,startPrice:true,bids:{orderBy:{amount:"desc"},take:1,select:{amount:true}}}}).then(a=>{console.log(JSON.stringify(a));p.$disconnect()})' 2>/dev/null || echo "null")
AUCTION_ID=$(echo "$AUCTION_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') if d else '')" 2>/dev/null || true)
CURRENT=$(echo "$AUCTION_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); bids=(d or {}).get('bids') or []; print(bids[0]['amount'] if bids else (d or {}).get('startPrice') or 0)" 2>/dev/null || echo 0)
STEP=$(echo "$AUCTION_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d or {}).get('bidStep') or 200)" 2>/dev/null || echo 200)
BID_AMT=$(python3 -c "print(int($CURRENT)+int($STEP))")

if [ -n "$AUCTION_ID" ]; then
  resp=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$BID_AMT}")
  echo "  Bid response: $resp"
  echo "$resp" | grep -q '"ok":true' && check "Place bid" "ok" "ok" || check "Place bid" "ok" "fail"
else
  check "Place bid (LIVE auction exists)" "ok" "fail"
fi

LISTING=$(npx tsx -e 'import {PrismaClient} from "@prisma/client"; const p=new PrismaClient(); p.dryingFieldListing.findFirst({where:{status:"OPERATING"},select:{id:true}}).then(a=>{console.log(a?.id||"");p.$disconnect()})' 2>/dev/null || true)
if [ -n "$LISTING" ]; then
  TOMORROW=$(date -d "+1 day" +%Y-%m-%d 2>/dev/null || date -v+1d +%Y-%m-%d)
  resp=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING\",\"startDate\":\"$TOMORROW\",\"endDate\":\"$TOMORROW\"}")
  echo "  Reserve response: $resp"
  echo "$resp" | grep -qE '"ok":true|"reservationId"' && check "Drying reserve" "ok" "ok" || check "Drying reserve" "ok" "fail"
else
  check "Drying reserve (listing exists)" "ok" "fail"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
