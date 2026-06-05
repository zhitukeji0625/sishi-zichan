#!/bin/bash
# Functional completeness test script
set -euo pipefail
BASE="http://localhost:3000"
COOKIE_JAR="/tmp/sishi-cookies.txt"
ADMIN_JAR="/tmp/sishi-admin-cookies.txt"
ERRORS=0
PASS=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name (HTTP $actual)"
    PASS=$((PASS+1))
  else
    echo "✗ $name — expected HTTP $expected, got $actual"
    ERRORS=$((ERRORS+1))
  fi
}

check_json() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -qE "$pattern"; then
    echo "✓ $name"
    PASS=$((PASS+1))
  else
    echo "✗ $name — body missing pattern: $pattern"
    echo "  Response: $body"
    ERRORS=$((ERRORS+1))
  fi
}

echo "=== Page Routes ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/m/me" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

echo ""
echo "=== Admin Login ==="
rm -f "$ADMIN_JAR"
ADMIN_RESP=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_RESP" | tail -1)
ADMIN_BODY=$(echo "$ADMIN_RESP" | sed '$d')
check "POST /api/auth/admin/login" "200" "$ADMIN_CODE"
check_json "Admin login success" '"ok":true' "$ADMIN_BODY"

echo ""
echo "=== User Login ==="
rm -f "$COOKIE_JAR"
USER_RESP=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
USER_CODE=$(echo "$USER_RESP" | tail -1)
USER_BODY=$(echo "$USER_RESP" | sed '$d')
check "POST /api/auth/login" "200" "$USER_CODE"
check_json "User login success" '"ok":true' "$USER_BODY"

echo ""
echo "=== Third-party Token (dev) ==="
TP_RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-user-001")
TP_CODE=$(echo "$TP_RESP" | tail -1)
TP_BODY=$(echo "$TP_RESP" | sed '$d')
check "GET /api/dev/third-party-token" "200" "$TP_CODE"
check_json "Third-party token" '"token"' "$TP_BODY"

echo ""
echo "=== Admin Protected Pages ==="
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/announcements" "/admin/organizations"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  check "GET $path (admin)" "200" "$code"
done

echo ""
echo "=== Admin API (create asset) ==="
ORG_ID=$(cd /workspace && npx tsx -e "import{PrismaClient}from'@prisma/client';const p=new PrismaClient();p.organization.findFirst({where:{code:'DIV1'}}).then(o=>{console.log(o?.id??'');p.\$disconnect()})" 2>/dev/null)
CREATE_RESP=$(curl -s -w "\n%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -F "orgId=$ORG_ID" -F "type=LAND" -F "name=自动化测试资产" -F "locationText=测试位置")
CREATE_CODE=$(echo "$CREATE_RESP" | tail -1)
CREATE_BODY=$(echo "$CREATE_RESP" | sed '$d')
check "POST /api/admin/assets" "200" "$CREATE_CODE"
check_json "Asset create success" '"ok":true' "$CREATE_BODY"

echo ""
echo "=== Auction Bid (need project id) ==="
# Query LIVE project from database
PROJECT_ID=$(cd /workspace && npx tsx -e "import{PrismaClient}from'@prisma/client';const p=new PrismaClient();p.auctionProject.findFirst({where:{status:'LIVE'},select:{id:true}}).then(x=>{console.log(x?.id??'');p.\$disconnect()})" 2>/dev/null)
if [ -n "$PROJECT_ID" ]; then
  MIN_BID=$(cd /workspace && npx tsx -e "
import{PrismaClient}from'@prisma/client';
import{Decimal}from'@prisma/client/runtime/library';
const p=new PrismaClient();
async function main(){
  const project=await p.auctionProject.findUnique({where:{id:'$PROJECT_ID'}});
  const top=await p.auctionBid.findFirst({where:{projectId:'$PROJECT_ID'},orderBy:{amount:'desc'}});
  if(!project){console.log('');return;}
  const min=top?Number(top.amount)+Number(project.bidStep):Number(project.startPrice);
  console.log(min);
}
main().finally(()=>p.\$disconnect());
" 2>/dev/null)
  BID_RESP=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  BID_CODE=$(echo "$BID_RESP" | tail -1)
  BID_BODY=$(echo "$BID_RESP" | sed '$d')
  check "POST /api/m/auction/$PROJECT_ID/bid" "200" "$BID_CODE"
  check_json "Bid success" '"ok":true' "$BID_BODY"
else
  echo "⚠ No LIVE auction project found — skipping bid test"
fi

echo ""
echo "=== Drying Reserve ==="
LISTING_ID=$(cd /workspace && npx tsx -e "import{PrismaClient}from'@prisma/client';const p=new PrismaClient();p.dryingFieldListing.findFirst({where:{status:'OPERATING'},select:{id:true}}).then(x=>{console.log(x?.id??'');p.\$disconnect()})" 2>/dev/null)
if [ -n "$LISTING_ID" ]; then
  TOMORROW=$(date -d "+3 day" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  DAY_AFTER=$(date -d "+4 day" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  RESERVE_RESP=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$TOMORROW\",\"endDate\":\"$DAY_AFTER\"}")
  RESERVE_CODE=$(echo "$RESERVE_RESP" | tail -1)
  RESERVE_BODY=$(echo "$RESERVE_RESP" | sed '$d')
  check "POST /api/m/drying/reserve" "200" "$RESERVE_CODE"
  check_json "Reserve success" '"ok":true' "$RESERVE_BODY"
else
  echo "⚠ No drying listing found — skipping reserve test"
fi

echo ""
echo "=== User Register (new phone) ==="
RAND_PHONE="139$(date +%s | tail -c 9)"
REG_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$RAND_PHONE\",\"password\":\"test123456\",\"name\":\"测试用户\",\"idCard\":\"650101199001011235\"}")
REG_CODE=$(echo "$REG_RESP" | tail -1)
REG_BODY=$(echo "$REG_RESP" | sed '$d')
check "POST /api/auth/register" "200" "$REG_CODE"
check_json "Register success" '"ok":true' "$REG_BODY"

echo ""
echo "=== Logout ==="
LOGOUT_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
check "POST /api/auth/logout" "200" "$LOGOUT_CODE"

ADMIN_LOGOUT_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
check "POST /api/auth/admin/logout" "200" "$ADMIN_LOGOUT_CODE"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS, Failed: $ERRORS"
if [ "$ERRORS" -gt 0 ]; then
  exit 1
fi
