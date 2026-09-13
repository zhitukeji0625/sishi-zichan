#!/usr/bin/env bash
# API smoke tests — requires dev server at BASE_URL (default http://localhost:3000)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
USER_COOKIE="/tmp/smoke_user_cookies.txt"
ADMIN_COOKIE="/tmp/smoke_admin_cookies.txt"
rm -f "$USER_COOKIE" "$ADMIN_COOKIE"

pass=0
fail=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name ($actual)"
    pass=$((pass + 1))
  else
    echo "FAIL: $name expected=$expected got=$actual"
    fail=$((fail + 1))
  fi
}

echo "=== Smoke tests against $BASE ==="

# Static pages
check "homepage" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "mobile home" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "mobile login page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "admin login page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "admin dashboard redirect" "307" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")"

# Auth
check "user login" "200" "$(curl -s -o /dev/null -w '%{http_code}' -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')"
check "admin login" "200" "$(curl -s -o /dev/null -w '%{http_code}' -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')"

# Register with unique phone
REG_PHONE="199$(date +%s | tail -c 9)"
check "register" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' -d "{\"phone\":\"$REG_PHONE\",\"password\":\"user123\",\"name\":\"冒烟测试\"}")"

# Dev third-party token
check "dev third-party token" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token")"

# Non-multipart upload/assets should return 400, not 500
check "upload non-multipart" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" -X POST "$BASE/api/upload" \
  -H 'Content-Type: application/json' -d '{}')"
check "admin assets non-multipart" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" -X POST "$BASE/api/admin/assets" \
  -H 'Content-Type: application/json' -d '{}')"

# Unauthenticated mobile API
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then(r => { console.log(r?.id ?? ''); })
  .finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)

if [ -z "$PROJECT_ID" ]; then
  echo "FAIL: no LIVE auction project in DB"
  fail=$((fail + 1))
else
  check "bid without auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' -d '{"amount":8200}')"

  # Compute min bid from DB
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const proj = await p.auctionProject.findUnique({
    where: { id: '$PROJECT_ID' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!proj) { console.log('0'); return; }
  const top = proj.bids[0]?.amount;
  const min = top ? Number(top) + Number(proj.bidStep) : Number(proj.startPrice);
  console.log(min);
}
main().finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)

  BID_RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}")
  if echo "$BID_RESP" | grep -q '"ok":true'; then
    echo "PASS: bid with auth (200)"
    pass=$((pass + 1))
  else
    echo "FAIL: bid with auth response=$BID_RESP"
    fail=$((fail + 1))
  fi
fi

# Drying reserve
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { console.log(r?.id ?? ''); })
  .finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)

if [ -z "$LISTING_ID" ]; then
  echo "FAIL: no OPERATING drying listing in DB"
  fail=$((fail + 1))
else
  START=$(date -d "+10 days" +%Y-%m-%d 2>/dev/null || date -v+10d +%Y-%m-%d)
  END=$(date -d "+11 days" +%Y-%m-%d 2>/dev/null || date -v+11d +%Y-%m-%d)
  DRY_RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  if echo "$DRY_RESP" | grep -q '"ok":true'; then
    echo "PASS: drying reserve (200)"
    pass=$((pass + 1))
  else
    echo "FAIL: drying reserve response=$DRY_RESP"
    fail=$((fail + 1))
  fi
fi

# Logout
check "user logout" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_COOKIE" -X POST "$BASE/api/auth/logout")"
check "admin logout" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/logout")"

# Mobile pages after auth flows
check "auction list page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check "drying list page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"

echo "=== Results: $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
