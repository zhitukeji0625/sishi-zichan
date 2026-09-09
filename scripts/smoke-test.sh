#!/usr/bin/env bash
# API smoke tests — requires dev server at localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/smoke-user-cookies.txt"
ADMIN_JAR="/tmp/smoke-admin-cookies.txt"
rm -f "$COOKIE_JAR" "$ADMIN_JAR"

check() {
  local name="$1" expect="$2" actual="$3" body="$4"
  if [ "$actual" = "$expect" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expect, got $actual) body=${body:0:200}"
    FAIL=$((FAIL + 1))
  fi
}

code=$(curl -s -o /tmp/smoke-r1 -w "%{http_code}" "$BASE/")
check "homepage" "200" "$code" "$(cat /tmp/smoke-r1)"

code=$(curl -s -o /tmp/smoke-r2 -w "%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check "user login" "200" "$code" "$(cat /tmp/smoke-r2)"

code=$(curl -s -o /tmp/smoke-r3 -w "%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check "admin login" "200" "$code" "$(cat /tmp/smoke-r3)"

code=$(curl -s -o /tmp/smoke-r4 -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
check "admin assets no auth" "401" "$code" "$(cat /tmp/smoke-r4)"

code=$(curl -s -o /tmp/smoke-r5 -w "%{http_code}" -X POST "$BASE/api/upload")
check "upload no auth" "401" "$code" "$(cat /tmp/smoke-r5)"

code=$(curl -s -o /tmp/smoke-r6 -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
check "upload non-multipart" "400" "$code" "$(cat /tmp/smoke-r6)"

code=$(curl -s -o /tmp/smoke-r7 -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
check "asset non-multipart" "400" "$code" "$(cat /tmp/smoke-r7)"

code=$(curl -s -o /tmp/smoke-r8 -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check "register duplicate" "409" "$code" "$(cat /tmp/smoke-r8)"

code=$(curl -s -o /tmp/smoke-r9 -w "%{http_code}" -X POST "$BASE/api/m/auction/demo/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
check "bid no auth" "401" "$code" "$(cat /tmp/smoke-r9)"

code=$(curl -s -o /tmp/smoke-r10 -w "%{http_code}" "$BASE/admin")
check "admin page no auth" "307" "$code" "$(cat /tmp/smoke-r10)"

code=$(curl -s -o /tmp/smoke-r11 -w "%{http_code}" "$BASE/api/dev/third-party-token")
check "third-party token" "200" "$code" "$(cat /tmp/smoke-r11)"

code=$(curl -s -o /tmp/smoke-r12 -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -d '{}')
check "drying invalid params" "400" "$code" "$(cat /tmp/smoke-r12)"

# Refresh demo auction via list page, then bid
curl -s "$BASE/m/auction" > /dev/null
PROJ_JSON=$(cd "$(dirname "$0")/.." && npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();const r=await p.auctionProject.findFirst({where:{status:'LIVE'},select:{id:true,startPrice:true,bidStep:true}});const top=await p.auctionBid.findFirst({where:{projectId:r?.id},orderBy:{amount:'desc'}});const min=top?Number(top.amount)+Number(r?.bidStep??0):Number(r?.startPrice??0);console.log(JSON.stringify({id:r?.id,min}));await p.\$disconnect();})()")
PROJ_ID=$(echo "$PROJ_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))")
MIN_BID=$(echo "$PROJ_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(int(d.get('min',8000)))")

if [ -n "$PROJ_ID" ]; then
  code=$(curl -s -o /tmp/smoke-r13 -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJ_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  check "auction bid" "200" "$code" "$(cat /tmp/smoke-r13)"
else
  echo "FAIL: auction bid (no LIVE project found)"
  FAIL=$((FAIL + 1))
fi

LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();const r=await p.dryingFieldListing.findFirst({where:{status:'OPERATING'},select:{id:true}});console.log(r?.id??'');await p.\$disconnect();})()")
START_DATE=$(date -u -d "+5 days" +%Y-%m-%d)
END_DATE=$(date -u -d "+6 days" +%Y-%m-%d)
code=$(curl -s -o /tmp/smoke-r14 -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
check "drying reserve" "200" "$code" "$(cat /tmp/smoke-r14)"

code=$(curl -s -o /tmp/smoke-r15 -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"","password":""}')
check "login empty" "400" "$code" "$(cat /tmp/smoke-r15)"

code=$(curl -s -o /tmp/smoke-r16 -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')
check "login wrong password" "401" "$code" "$(cat /tmp/smoke-r16)"

code=$(curl -s -o /tmp/smoke-r17 -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
check "user logout" "200" "$code" "$(cat /tmp/smoke-r17)"

code=$(curl -s -o /tmp/smoke-r18 -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
check "admin logout" "200" "$code" "$(cat /tmp/smoke-r18)"

code=$(curl -s -o /tmp/smoke-r19 -w "%{http_code}" "$BASE/m/auction")
check "auction page" "200" "$code" "$(head -c 100 /tmp/smoke-r19)"

echo "---"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
