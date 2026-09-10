#!/usr/bin/env bash
# API smoke tests — run against dev server on localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_USER=/tmp/smoke_user_cookies.txt
COOKIE_ADMIN=/tmp/smoke_admin_cookies.txt

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_json() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -q "$pattern"; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (body: $body)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test: $BASE ==="

# 1. Public pages
check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

# 2. User login
BODY=$(curl -s -c "$COOKIE_USER" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_json "POST /api/auth/login" '"ok":true' "$BODY"

# 3. Admin login
BODY=$(curl -s -c "$COOKIE_ADMIN" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json "POST /api/auth/admin/login" '"ok":true' "$BODY"

# 4. Authenticated mobile pages
check "GET /m/me" 200 "$(curl -s -b "$COOKIE_USER" -o /dev/null -w '%{http_code}' "$BASE/m/me")"
check "GET /m/auction" 200 "$(curl -s -b "$COOKIE_USER" -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check "GET /m/drying" 200 "$(curl -s -b "$COOKIE_USER" -o /dev/null -w '%{http_code}' "$BASE/m/drying")"
check "GET /m/orders" 200 "$(curl -s -b "$COOKIE_USER" -o /dev/null -w '%{http_code}' "$BASE/m/orders")"

# 5. Authenticated admin pages
check "GET /admin" 200 "$(curl -s -b "$COOKIE_ADMIN" -L -o /dev/null -w '%{http_code}' "$BASE/admin")"
check "GET /admin/assets" 200 "$(curl -s -b "$COOKIE_ADMIN" -L -o /dev/null -w '%{http_code}' "$BASE/admin/assets")"
check "GET /admin/auctions" 200 "$(curl -s -b "$COOKIE_ADMIN" -L -o /dev/null -w '%{http_code}' "$BASE/admin/auctions")"
check "GET /admin/drying" 200 "$(curl -s -b "$COOKIE_ADMIN" -L -o /dev/null -w '%{http_code}' "$BASE/admin/drying")"

# 6. Non-multipart upload returns 400 (not 500)
check "POST /api/upload (non-multipart)" 400 "$(curl -s -b "$COOKIE_ADMIN" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')"

# 7. Non-multipart asset create returns 400
check "POST /api/admin/assets (non-multipart)" 400 "$(curl -s -b "$COOKIE_ADMIN" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{"name":"test"}')"

# 8. Third-party token (dev only)
BODY=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test")
check_json "GET /api/dev/third-party-token" '"token"' "$BODY"

# 9. Drying reservation
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import {PrismaClient} from '@prisma/client';
const p=new PrismaClient();
p.dryingFieldListing.findFirst({select:{id:true}}).then(r=>{process.stdout.write(r?.id??'');}).finally(()=>p.\$disconnect());
" 2>/dev/null)
if [[ -n "$LISTING_ID" ]]; then
  BODY=$(curl -s -b "$COOKIE_USER" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-03\"}")
  check_json "POST /api/m/drying/reserve" '"ok":true' "$BODY"
else
  echo "  ⚠ skipping drying reserve (no listing)"
fi

# 10. Auction bid — dynamic min amount
AUCTION_HTML=$(curl -s -b "$COOKIE_USER" "$BASE/m/auction")
PROJECT_ID=$(echo "$AUCTION_HTML" | grep -oE 'c[a-z0-9]{20,}' | head -1 || true)
if [[ -n "$PROJECT_ID" ]]; then
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import {PrismaClient} from '@prisma/client';
const p=new PrismaClient();
async function main() {
  const project=await p.auctionProject.findUnique({where:{id:'$PROJECT_ID'},include:{bids:{orderBy:{amount:'desc'},take:1}}});
  if(!project){process.stdout.write('0');return;}
  const top=project.bids[0]?.amount;
  const min=top?Number(top)+Number(project.bidStep):Number(project.startPrice);
  process.stdout.write(String(min));
}
main().finally(()=>p.\$disconnect());
" 2>/dev/null)
  BODY=$(curl -s -b "$COOKIE_USER" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  check_json "POST /api/m/auction/bid" '"ok":true' "$BODY"
else
  echo "  ⚠ skipping auction bid (no LIVE project in HTML)"
fi

# 11. User registration with unique phone
PHONE="199$(date +%s | tail -c 9)"
BODY=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
check_json "POST /api/auth/register" '"ok":true' "$BODY"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
