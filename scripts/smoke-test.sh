#!/usr/bin/env bash
# 功能冒烟测试：需先启动 npm run dev
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
ADMIN_JAR="${TMPDIR:-/tmp}/smoke_admin.txt"
USER_JAR="${TMPDIR:-/tmp}/smoke_user.txt"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_contains() {
  local name="$1" needle="$2" body="$3"
  if echo "$body" | grep -q "$needle"; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (missing: $needle)"
    echo "  body: ${body:0:200}"
    FAIL=$((FAIL + 1))
  fi
}

db_query() {
  cd "$(dirname "$0")/.." && npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();$1;await p.\$disconnect()})()"
}

echo "=== Page tests ==="
check "GET /" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")"
check "GET /m" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")"
check "GET /m/login" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")"
check "GET /admin (no auth)" 307 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")"
check "GET /favicon.ico" 200 "$(curl -sL -o /dev/null -w "%{http_code}" "$BASE/favicon.ico")"

echo "=== Auth protection ==="
check "POST /api/m/auction/x/bid (no auth)" 401 "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/x/bid" -H "Content-Type: application/json" -d '{"amount":100}')"

echo "=== Admin login ==="
ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check_contains "Admin login ok" '"ok":true' "$ADMIN_RESP"
check "GET /admin (with auth)" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")"

echo "=== User login ==="
USER_RESP=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check_contains "User login ok" '"ok":true' "$USER_RESP"

echo "=== Upload tests ==="
check "Upload no auth" 401 "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")"
check "Upload non-multipart" 400 "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{"x":1}')"

echo "=== Auction bid ==="
PROJECT_ID=$(db_query 'const proj=await p.auctionProject.findFirst({where:{status:"LIVE"},orderBy:{createdAt:"desc"}});console.log(proj?.id??"")' 2>/dev/null | tail -1)
if [ -n "$PROJECT_ID" ]; then
  BID_INFO=$(db_query "const proj=await p.auctionProject.findUnique({where:{id:\"$PROJECT_ID\"},include:{bids:{orderBy:{amount:\"desc\"},take:1}}});const min=proj?.bids[0]?Number(proj.bids[0].amount)+Number(proj.bidStep):Number(proj?.startPrice??0);console.log(min)" 2>/dev/null | tail -1)
  BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$BID_INFO}")
  check_contains "Auction bid" '"ok":true' "$BID_RESP"
  check "Auction invalid bid" 400 "$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H "Content-Type: application/json" -d '{"amount":1}')"
else
  echo "✗ No LIVE auction project"
  FAIL=$((FAIL + 1))
fi

echo "=== Drying reserve ==="
LISTING_ID=$(db_query 'const l=await p.dryingFieldListing.findFirst({where:{status:"OPERATING"}});console.log(l?.id??"")' 2>/dev/null | tail -1)
if [ -n "$LISTING_ID" ]; then
  # 使用动态日期避免重复运行冲突
  OFFSET=$((60 + RANDOM % 200))
  START_DATE=$(date -d "+${OFFSET} days" +%Y-%m-%d 2>/dev/null || date -v+"${OFFSET}d" +%Y-%m-%d)
  END_DATE=$(date -d "+$((OFFSET + 2)) days" +%Y-%m-%d 2>/dev/null || date -v+"$((OFFSET + 2))d" +%Y-%m-%d)
  OVERLAP_START=$(date -d "+$((OFFSET + 1)) days" +%Y-%m-%d 2>/dev/null || date -v+"$((OFFSET + 1))d" +%Y-%m-%d)
  OVERLAP_END=$(date -d "+$((OFFSET + 3)) days" +%Y-%m-%d 2>/dev/null || date -v+"$((OFFSET + 3))d" +%Y-%m-%d)
  DRY_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  check_contains "Drying reserve" '"ok":true' "$DRY_RESP"
  DRY_OVERLAP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$OVERLAP_START\",\"endDate\":\"$OVERLAP_END\"}")
  check_contains "Drying overlap rejected" "error" "$DRY_OVERLAP"
else
  echo "✗ No drying listing"
  FAIL=$((FAIL + 1))
fi

echo "=== Dev third-party token ==="
TP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test123")
check_contains "Third-party token" "token" "$TP"

echo "=== Register validation ==="
check "Register empty" 400 "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" -d '{}')"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
