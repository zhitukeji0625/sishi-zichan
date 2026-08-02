#!/usr/bin/env bash
# Functional completeness test for sishi-zichan
set -euo pipefail
BASE="http://localhost:3000"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
PASS=0
FAIL=0
SKIP=0

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
skip() { echo "  ~ $1"; SKIP=$((SKIP+1)); }

check_status() {
  local name="$1" url="$2" expected="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" = "$expected" ]; then pass "$name ($code)"; else fail "$name (got $code, want $expected)"; fi
}

check_json() {
  local name="$1" method="$2" url="$3" data="$4" jar="$5" expected_code="$6" json_path="$7" expected_val="$8"
  local resp code val
  if [ "$method" = "POST" ]; then
    resp=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -b "$jar" -c "$jar" -d "$data" "$url")
  else
    resp=$(curl -s -w "\n%{http_code}" -b "$jar" -c "$jar" "$url")
  fi
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')
  if [ "$code" != "$expected_code" ]; then
    fail "$name (HTTP $code, want $expected_code) body=$body"
    return
  fi
  if [ -n "$json_path" ]; then
    val=$(echo "$body" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); const p='$json_path'.split('.'); let v=d; for(const k of p) v=v?.[k]; process.stdout.write(String(v??''));")
    if [ "$val" = "$expected_val" ]; then pass "$name"; else fail "$name (got '$val', want '$expected_val') body=$body"; fi
  else
    pass "$name"
  fi
}

echo "=== Page smoke tests ==="
for path in "/" "/admin/login" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/m/me" "/m/orders"; do
  check_status "GET $path" "$BASE$path" "200"
done
check_status "GET /admin (redirect when unauth)" "$BASE/admin" "307"

echo ""
echo "=== API: Auth ==="
check_json "User login missing fields" POST "$BASE/api/auth/login" '{}' "$COOKIE_JAR" 400 "" ""
check_json "User login wrong creds" POST "$BASE/api/auth/login" '{"phone":"13800138000","password":"wrong"}' "$COOKIE_JAR" 401 "" ""
check_json "User login OK" POST "$BASE/api/auth/login" '{"phone":"13800138000","password":"user123"}' "$COOKIE_JAR" 200 "ok" "true"

check_json "Admin login missing fields" POST "$BASE/api/auth/admin/login" '{}' "$ADMIN_JAR" 400 "" ""
check_json "Admin login OK" POST "$BASE/api/auth/admin/login" '{"phone":"13900000001","password":"admin123"}' "$ADMIN_JAR" 200 "ok" "true"

echo ""
echo "=== API: Register ==="
RAND_PHONE="139$(date +%s | tail -c 9)"
check_json "Register new user" POST "$BASE/api/auth/register" "{\"phone\":\"$RAND_PHONE\",\"password\":\"test1234\",\"name\":\"测试用户\",\"idCard\":\"650101199001011234\"}" "$COOKIE_JAR" 200 "ok" "true"
check_json "Register duplicate phone" POST "$BASE/api/auth/register" "{\"phone\":\"$RAND_PHONE\",\"password\":\"test1234\",\"name\":\"测试用户\",\"idCard\":\"650101199001011234\"}" "$COOKIE_JAR" 409 "" ""

echo ""
echo "=== API: Third-party SSO ==="
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=ext_user_001")
TOKEN=$(echo "$TOKEN_RESP" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(d.token||'');")
if [ -n "$TOKEN" ]; then
  SSO_JAR=$(mktemp)
  check_json "Third-party auth" POST "$BASE/api/auth/third-party" "{\"token\":\"$TOKEN\"}" "$SSO_JAR" 200 "ok" "true"
  rm -f "$SSO_JAR"
  # Re-login demo user for bid/drying tests (SSO replaces session)
  check_json "Re-login demo user" POST "$BASE/api/auth/login" '{"phone":"13800138000","password":"user123"}' "$COOKIE_JAR" 200 "ok" "true"
else
  fail "Third-party token generation (resp=$TOKEN_RESP)"
fi

echo ""
echo "=== API: Admin assets ==="
check_status "GET /api/admin/assets (405 expected)" "$BASE/api/admin/assets" "405"
check_json "POST /api/admin/assets no body" POST "$BASE/api/admin/assets" '{}' "$ADMIN_JAR" 400 "" ""
check_json "POST /api/upload no body" POST "$BASE/api/upload" '{}' "$ADMIN_JAR" 400 "" ""
check_json "POST /api/upload no auth" POST "$BASE/api/upload" '{}' "/dev/null" 401 "" ""

echo ""
echo "=== API: Auction bid ==="
# Ensure a LIVE project exists
PROJECT_ID=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  let proj=await p.auctionProject.findFirst({orderBy:{createdAt:'desc'}});
  if(!proj) { console.error('no project'); process.exit(1); }
  if(proj.status!=='LIVE'){
    await p.auctionProject.update({where:{id:proj.id},data:{
      status:'LIVE',
      startsAt:new Date(Date.now()-60000),
      endsAt:new Date(Date.now()+7*24*60*60*1000)
    }});
  }
  console.log(proj.id);
  await p.\$disconnect();
})();
" 2>/dev/null)
if [ -n "$PROJECT_ID" ]; then
  check_json "Bid without amount" POST "$BASE/api/m/auction/$PROJECT_ID/bid" '{}' "$COOKIE_JAR" 400 "" ""
  BID_AMOUNT=$(node -e "
const {PrismaClient,Decimal}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const proj=await p.auctionProject.findUnique({where:{id:'$PROJECT_ID'}});
  const top=await p.auctionBid.findFirst({where:{projectId:'$PROJECT_ID'},orderBy:{amount:'desc'}});
  const min=top?Number(top.amount)+Number(proj.bidStep):Number(proj.startPrice);
  console.log(min);
  await p.\$disconnect();
})();
" 2>/dev/null)
  check_json "Bid valid amount" POST "$BASE/api/m/auction/$PROJECT_ID/bid" "{\"amount\":$BID_AMOUNT}" "$COOKIE_JAR" 200 "ok" "true"
else
  fail "Could not find/create LIVE auction project"
fi

echo ""
echo "=== API: Drying reserve ==="
DRYING_ID=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const d=await p.dryingFieldListing.findFirst({where:{status:'OPERATING'}});
  console.log(d?.id||'');
  await p.\$disconnect();
})();
" 2>/dev/null)
if [ -n "$DRYING_ID" ]; then
  TOMORROW=$(date -u -d "+1 day" +%Y-%m-%d 2>/dev/null || date -u -v+1d +%Y-%m-%d)
  DAY_AFTER=$(date -u -d "+2 days" +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  check_json "Drying reserve" POST "$BASE/api/m/drying/reserve" "{\"listingId\":\"$DRYING_ID\",\"startDate\":\"$TOMORROW\",\"endDate\":\"$DAY_AFTER\"}" "$COOKIE_JAR" 200 "ok" "true"
else
  skip "No OPERATING drying listing"
fi

echo ""
echo "=== API: Logout ==="
check_json "User logout" POST "$BASE/api/auth/logout" '{}' "$COOKIE_JAR" 200 "" ""
check_json "Admin logout" POST "$BASE/api/auth/admin/logout" '{}' "$ADMIN_JAR" 200 "" ""

echo ""
echo "=== Summary ==="
echo "PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
rm -f "$COOKIE_JAR" "$ADMIN_JAR"
[ "$FAIL" -eq 0 ]
