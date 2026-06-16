#!/usr/bin/env bash
# API 冒烟测试：需服务运行在 BASE_URL（默认 http://localhost:3000）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="$(mktemp)"
ADMIN_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

# 刷新演示竞拍为 LIVE
npx tsx prisma/seed.ts >/dev/null 2>&1 || true

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "GET /" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check "GET /admin/login" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")
check "GET /m/login" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check "POST /api/auth/login" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check "POST /api/auth/admin/login" "200" "$code"

if [ "${ALLOW_DEV_ROUTES:-false}" = "true" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test")
  check "GET /api/dev/third-party-token" "200" "$code"
else
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test")
  check "GET /api/dev/third-party-token (disabled)" "404" "$code"
fi

PROJECT_ID=$(npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();const u=await p.endUser.findUnique({where:{phone:'13800138000'}});const x=await p.auctionProject.findFirst({where:{registrations:{some:{endUserId:u?.id??''}}},orderBy:{createdAt:'desc'}});console.log(x?.id??'');await p.\$disconnect();})();" 2>/dev/null)

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
  -H "Content-Type: application/json" -d '{"amount":8000}')
check "POST bid without auth" "401" "$code"

# 动态计算最低出价
MIN_BID=$(npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const{Decimal}=await import('@prisma/client/runtime/library');const p=new PrismaClient();const proj=await p.auctionProject.findUnique({where:{id:'$PROJECT_ID'}});if(!proj){console.log('0');await p.\$disconnect();return;}const top=await p.auctionBid.findFirst({where:{projectId:'$PROJECT_ID'},orderBy:{amount:'desc'}});const min=top?new Decimal(top.amount.toString()).plus(proj.bidStep.toString()):new Decimal(proj.startPrice.toString());console.log(min.toString());await p.\$disconnect();})();" 2>/dev/null)

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
  -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
check "POST bid with auth" "200" "$code"

LISTING_ID=$(npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();const x=await p.dryingFieldListing.findFirst();console.log(x?.id??'');await p.\$disconnect();})();" 2>/dev/null)

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-08-01\",\"endDate\":\"2026-08-03\"}")
check "POST drying reserve" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"x","type":"LAND","name":"test","locationText":"test"}')
check "POST admin/assets non-multipart" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123","name":"dup"}')
check "POST register duplicate" "409" "$code"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
