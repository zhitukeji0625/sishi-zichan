#!/usr/bin/env bash
# HTTP smoke tests — run against a live dev server (npm run dev).
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0; FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS+1)); echo "✓ $name"
  else
    FAIL=$((FAIL+1)); echo "✗ $name (expected $expected, got $actual)"
  fi
}

# Trigger layout cron (refresh demo auction)
curl -s -o /dev/null "$BASE/"

for path in "/" "/m" "/m/auction" "/m/drying" "/m/login" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

curl -s -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' -c /tmp/smoke_admin.txt -o /dev/null
check "admin login" "200" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')"

curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' -c /tmp/smoke_user.txt -o /dev/null
check "user login" "200" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')"

for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/dict"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/smoke_admin.txt "$BASE$path")
  check "GET $path" "200" "$code"
done

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -b /tmp/smoke_admin.txt "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')
check "upload non-multipart → 400" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
check "third-party token" "200" "$code"

LISTING_ID=$(curl -s -b /tmp/smoke_user.txt "$BASE/m/drying" | grep -oP 'href="/m/drying/[^"]+' | head -1 | sed 's|.*/||' || true)
if [ -z "$LISTING_ID" ]; then
  LISTING_ID=$(node -e "
    const {PrismaClient}=require('@prisma/client');
    const p=new PrismaClient();
    p.dryingFieldListing.findFirst().then(r=>{console.log(r?.id||'');p.\$disconnect()});
  " 2>/dev/null || true)
fi
START=$(date -d "+5 days" +%Y-%m-%d 2>/dev/null || date -v+5d +%Y-%m-%d)
END=$(date -d "+6 days" +%Y-%m-%d 2>/dev/null || date -v+6d +%Y-%m-%d)
if [ -n "$LISTING_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" -b /tmp/smoke_user.txt \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check "drying reserve" "200" "$code"
fi

# Refresh demo auction via layout, then bid
curl -s -o /dev/null "$BASE/m/auction"
PROJECT_ID=$(node -e "
  const {PrismaClient}=require('@prisma/client');
  const p=new PrismaClient();
  p.auctionProject.findFirst().then(r=>{console.log(r?.id||'');p.\$disconnect()});
" 2>/dev/null || true)
if [ -n "$PROJECT_ID" ]; then
  BID=$(node -e "
    const {PrismaClient}=require('@prisma/client');
    const p=new PrismaClient();
    (async()=>{
      const proj=await p.auctionProject.findUnique({where:{id:'$PROJECT_ID'}});
      const top=await p.auctionBid.findFirst({where:{projectId:'$PROJECT_ID'},orderBy:{amount:'desc'}});
      const min=top?Number(top.amount)+Number(proj.bidStep):Number(proj.startPrice);
      console.log(min);
      await p.\$disconnect();
    })();
  " 2>/dev/null || echo "8400")
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -b /tmp/smoke_user.txt -d "{\"amount\": $BID}")
  check "auction bid" "200" "$code"
fi

echo ""
echo "Smoke test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
