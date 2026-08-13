#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/func-test-user.txt"
ADMIN_JAR="/tmp/func-test-admin.txt"
rm -f "$COOKIE_JAR" "$ADMIN_JAR"

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

check_json() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -q "$pattern"; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (body: $body)"
    FAIL=$((FAIL + 1))
  fi
}

query_db() {
  cd /workspace && npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();$1;await p.\$disconnect();})()"
}

echo "=== Public pages ==="
check "GET /" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /admin/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "GET /m/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"

echo "=== Auth ==="
check "login empty" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"","password":""}')"
check "login wrong pwd" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"wrong"}')"

BODY=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')
check_json "user login" '"ok":true' "$BODY"

BODY=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')
check_json "admin login" '"ok":true' "$BODY"

echo "=== Protected routes ==="
check "bid without auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/fake/bid" -H 'Content-Type: application/json' -d '{"amount":1000}')"
check "admin without auth" "307" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")"

echo "=== Third party token ==="
BODY=$(curl -s "$BASE/api/dev/third-party-token?u_id=testuser001")
check_json "third-party token" 'token' "$BODY"

echo "=== Auction bid ==="
PROJECT_ID=$(query_db "const proj=await p.auctionProject.findFirst({where:{code:'DEMO_LIVE_AUCTION',status:'LIVE'}});console.log(proj?.id??'');")
if [ -z "$PROJECT_ID" ]; then
  echo "✗ no LIVE auction"
  FAIL=$((FAIL + 1))
else
  MIN_BID=$(query_db "const proj=await p.auctionProject.findFirst({where:{code:'DEMO_LIVE_AUCTION',status:'LIVE'}});if(!proj){console.log('');return;}const top=await p.auctionBid.findFirst({where:{projectId:proj.id},orderBy:{amount:'desc'}});const min=top?Number(top.amount)+Number(proj.bidStep):Number(proj.startPrice);console.log(min);")
  BODY=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}")
  check_json "auction bid" '"ok":true' "$BODY"
  check "auction rent on LIVE" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/m/payments/mock" -H 'Content-Type: application/json' -d "{\"purpose\":\"AUCTION_RENT\",\"auctionProjectId\":\"$PROJECT_ID\"}")"
fi

echo "=== Drying reserve ==="
LISTING_ID=$(query_db "const l=await p.dryingFieldListing.findFirst({where:{status:'OPERATING'}});console.log(l?.id??'');")
if [ -z "$LISTING_ID" ]; then
  echo "✗ no drying listing"
  FAIL=$((FAIL + 1))
else
  FAR=$(date -u -d '+30 days' +%Y-%m-%d 2>/dev/null || date -u -v+30d +%Y-%m-%d)
  check "drying far future" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$FAR\",\"endDate\":\"$FAR\"}")"
  START=$(date -u -d '+1 day' +%Y-%m-%d 2>/dev/null || date -u -v+1d +%Y-%m-%d)
  BODY=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$START\"}")
  check_json "drying reserve" '"ok":true' "$BODY"
fi

echo "=== Admin pages ==="
check "admin dashboard" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin")"
check "admin assets" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin/assets")"
check "admin auctions" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin/auctions")"
check "admin drying" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin/drying")"

echo "=== Mobile pages ==="
check "m auction" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/auction")"
check "m drying" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/drying")"
check "m me" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/me")"
check "m orders" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/orders")"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
