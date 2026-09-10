#!/usr/bin/env bash
# API smoke tests — requires dev server running on localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

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

# Prepare DB: ensure LIVE auction
node "$(dirname "$0")/smoke-db.mjs"

# 1–3. Pages
check "GET /" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")"
check "GET /m/login" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")"
check "GET /admin/login" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")"

# 4–5. User auth
check "POST /api/auth/login invalid" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"000","password":"wrong"}')"
CODE=$(curl -s -c "$COOKIE_JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check "POST /api/auth/login valid" "200" "$CODE"

# 6. Middleware
check "POST /api/m/auction/x/bid no auth" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/test/bid" -H "Content-Type: application/json" -d '{"amount":100}')"

# 7. Admin auth
CODE=$(curl -s -c "$ADMIN_JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check "POST /api/auth/admin/login valid" "200" "$CODE"

# 8–11. Multipart guards
check "POST /api/upload non-multipart" "400" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" -b "$ADMIN_JAR" -H "Content-Type: application/json" -d '{}')"
check "POST /api/upload no auth" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')"
check "POST /api/admin/assets non-multipart" "400" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" -b "$ADMIN_JAR" -H "Content-Type: application/json" -d '{}')"
check "POST /api/admin/assets no auth" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{}')"

# 12–13. Register & dev token
check "POST /api/auth/register missing" "400" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" -d '{}')"
check "GET /api/dev/third-party-token" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test123")"

# 14–17. Pages with auth
check "GET /admin" "200" "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")"
check "GET /m" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")"
check "GET /m/auction" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")"
check "GET /m/drying" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying")"

# 18. Bid on LIVE auction
read -r PID START STEP < <(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.auctionProject.findFirst({where:{status:'LIVE'},select:{id:true,startPrice:true,bidStep:true}})
  .then(r=>{if(r)console.log(r.id,r.startPrice,r.bidStep);else console.log('none 0 0');p.\$disconnect();});
")
if [ "$PID" != "none" ]; then
  MAX_BID=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.auctionBid.findFirst({where:{projectId:'$PID'},orderBy:{amount:'desc'},select:{amount:true}})
  .then(r=>{console.log(r?r.amount.toString():'0');p.\$disconnect();});
")
  if [ "$MAX_BID" = "0" ]; then BID_AMT=$START; else BID_AMT=$(node -e "console.log(parseFloat('$MAX_BID')+parseFloat('$STEP'))"); fi
  CODE=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PID/bid" -H "Content-Type: application/json" -d "{\"amount\":$BID_AMT}")
  check "POST /api/m/auction/bid" "200" "$CODE"
else
  echo "✗ No LIVE auction project"
  FAIL=$((FAIL + 1))
fi

# 19. Drying reserve
LISTING_ID=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.dryingFieldListing.findFirst({where:{status:'OPERATING'},select:{id:true}})
  .then(r=>{console.log(r?r.id:'none');p.\$disconnect();});
")
if [ "$LISTING_ID" != "none" ]; then
  START_DATE=$(date -d "+7 days" +%Y-%m-%d 2>/dev/null || date -v+7d +%Y-%m-%d)
  END_DATE=$(date -d "+14 days" +%Y-%m-%d 2>/dev/null || date -v+14d +%Y-%m-%d)
  CODE=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  if [ "$CODE" = "200" ] || [ "$CODE" = "409" ]; then
    echo "✓ POST /api/m/drying/reserve ($CODE)"
    PASS=$((PASS + 1))
  else
    echo "✗ POST /api/m/drying/reserve (expected 200/409, got $CODE)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "✗ No OPERATING drying listing"
  FAIL=$((FAIL + 1))
fi

# 20–21. Logout
check "POST /api/auth/logout" "200" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/logout" -b "$COOKIE_JAR")"
check "POST /api/auth/admin/logout" "200" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/logout" -b "$ADMIN_JAR")"

# 22. Register new user
PHONE="199$(date +%s | tail -c 9)"
check "POST /api/auth/register new user" "200" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"测试用户\"}")"

# 23. Admin middleware redirect
check "GET /admin no auth redirect" "307" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit "$FAIL"
