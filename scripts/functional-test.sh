#!/usr/bin/env bash
# API / 页面冒烟测试（需 dev server 运行于 BASE，默认 http://localhost:3000）
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

for path in / /m /m/login /m/register /m/auction /m/drying /admin/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

ADMIN_JAR=$(mktemp)
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')
check "POST /api/auth/admin/login" "200" "$code"

for path in /admin /admin/assets /admin/auctions /admin/drying /admin/dict; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  check "GET $path (admin)" "200" "$code"
done

USER_JAR=$(mktemp)
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')
check "POST /api/auth/login" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
check "GET /api/dev/third-party-token" "200" "$code"

for path in /m/me /m/orders; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" "$BASE$path")
  check "GET $path (user)" "200" "$code"
done

PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();const x=await p.auctionProject.findFirst();console.log(x?.id||'');await p.\$disconnect()})()" 2>/dev/null)
MIN=$(cd "$(dirname "$0")/.." && npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();const proj=await p.auctionProject.findFirst();const top=await p.auctionBid.findFirst({where:{projectId:proj!.id},orderBy:{amount:'desc'}});const min=top?Number(top.amount)+Number(proj!.bidStep):Number(proj!.startPrice);console.log(min);await p.\$disconnect()})()" 2>/dev/null)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
  -H 'Content-Type: application/json' -d "{\"amount\":$MIN}")
check "POST /api/m/auction/bid" "200" "$code"

LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();const x=await p.dryingFieldListing.findFirst();console.log(x?.id||'');await p.\$disconnect()})()" 2>/dev/null)
START=$(date -u -d '+14 days' +%Y-%m-%d)
END=$(date -u -d '+17 days' +%Y-%m-%d)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H 'Content-Type: application/json' -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
check "POST /api/m/drying/reserve" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
  -H 'Content-Type: application/json' -d '{"amount":99999}')
check "POST bid without auth" "401" "$code"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
