#!/usr/bin/env bash
# Functional smoke + API flow tests for sishi-zichan
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
PASS=0
FAIL=0

cleanup() { rm -f "$COOKIE_JAR" "$ADMIN_JAR"; }
trap cleanup EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name — $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Page smoke tests ==="
for path in / /m /m/login /m/register /m/auction /m/drying /m/orders /m/me /admin/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

echo ""
echo "=== Auth API tests ==="
# User login
code=$(curl -s -o /tmp/login.json -w "%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_status "POST /api/auth/login" "200" "$code"
assert_json_ok "user login body" "$(cat /tmp/login.json)"

# Bad login
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
assert_status "POST /api/auth/login (bad password)" "401" "$code"

# Admin login
code=$(curl -s -o /tmp/admin-login.json -w "%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_status "POST /api/auth/admin/login" "200" "$code"
assert_json_ok "admin login body" "$(cat /tmp/admin-login.json)"

echo ""
echo "=== Upload API (no body) ==="
code=$(curl -s -o /tmp/upload.json -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload")
assert_status "POST /api/upload (no file)" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
assert_status "POST /api/upload (no auth)" "401" "$code"

echo ""
echo "=== Admin assets API (no body) ==="
code=$(curl -s -o /tmp/asset.json -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets")
assert_status "POST /api/admin/assets (no body)" "400" "$code"

echo ""
echo "=== Auction bid flow ==="
# Ensure LIVE auction
PROJECT_ID=$(cd /workspace && node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.auctionProject.findFirst({where:{status:'LIVE'},select:{id:true,startPrice:true,bidStep:true}}).then(r=>{
  if(r) console.log(r.id+'|'+r.startPrice+'|'+r.bidStep);
  else console.log('NONE');
  p.\$disconnect();
});
" 2>/dev/null)

if [ "$PROJECT_ID" = "NONE" ] || [ -z "$PROJECT_ID" ]; then
  echo "  WARN: No LIVE auction, resetting one..."
  cd /workspace && node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.auctionProject.findFirst().then(async r=>{
  if(r) await p.auctionProject.update({where:{id:r.id},data:{status:'LIVE',startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+7*86400000)}});
  p.\$disconnect();
});
" 2>/dev/null
  PROJECT_ID=$(cd /workspace && node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.auctionProject.findFirst({where:{status:'LIVE'},select:{id:true,startPrice:true,bidStep:true}}).then(r=>{
  if(r) console.log(r.id+'|'+r.startPrice+'|'+r.bidStep);
  p.\$disconnect();
});
" 2>/dev/null)
fi

PID=$(echo "$PROJECT_ID" | cut -d'|' -f1)
START=$(echo "$PROJECT_ID" | cut -d'|' -f2)
STEP=$(echo "$PROJECT_ID" | cut -d'|' -f3)
BID_AMOUNT=$((START + STEP))

# Re-login user (admin login may have replaced session)
curl -s -o /dev/null -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}'

code=$(curl -s -o /tmp/bid.json -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PID/bid" \
  -H "Content-Type: application/json" \
  -d "{\"amount\":$BID_AMOUNT}")
assert_status "POST /api/m/auction/$PID/bid" "200" "$code"
assert_json_ok "bid body" "$(cat /tmp/bid.json)"

# Bid without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PID/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":99999}')
assert_status "POST bid (no auth)" "401" "$code"

echo ""
echo "=== Drying reserve flow ==="
LISTING_ID=$(cd /workspace && node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.dryingFieldListing.findFirst({where:{status:'OPERATING'},select:{id:true}}).then(r=>{
  if(r) console.log(r.id); else console.log('NONE');
  p.\$disconnect();
});
" 2>/dev/null)

if [ "$LISTING_ID" != "NONE" ] && [ -n "$LISTING_ID" ]; then
  START_DATE=$(date -u -d "+3 days" +%Y-%m-%d)
  END_DATE=$(date -u -d "+4 days" +%Y-%m-%d)
  code=$(curl -s -o /tmp/reserve.json -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  assert_status "POST /api/m/drying/reserve" "200" "$code"
  assert_json_ok "reserve body" "$(cat /tmp/reserve.json)"
else
  echo "  SKIP: no OPERATING drying listing"
fi

echo ""
echo "=== Third-party token (dev) ==="
code=$(curl -s -o /tmp/sso.json -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-user-001")
assert_status "GET /api/dev/third-party-token" "200" "$code"

echo ""
echo "=== Admin protected page ==="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
assert_status "GET /admin (no auth)" "307" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -L "$BASE/admin")
assert_status "GET /admin (with auth)" "200" "$code"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS, Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
echo "All tests passed."
