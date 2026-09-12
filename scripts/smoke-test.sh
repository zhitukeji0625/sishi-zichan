#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

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

echo "=== Smoke test @ $BASE ==="

check "homepage" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")"
check "m/auction" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")"
check "m/drying" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying")"
check "m/login" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")"
check "admin/login" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")"

USER_COOKIE=$(mktemp)
check "user login" "200" "$(curl -s -o /dev/null -w "%{http_code}" -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')"

ADMIN_COOKIE=$(mktemp)
check "admin login" "200" "$(curl -s -o /dev/null -w "%{http_code}" -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')"

PHONE="199$(date +%s | tail -c 9)"
check "register" "200" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"测试\"}")"

check "upload no auth" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")"
check "upload non-multipart" "400" "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')"
check "assets non-multipart" "400" "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')"
check "bid no auth" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')"
check "login empty" "400" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"","password":""}')"
check "admin no auth redirect" "307" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")"

# Dynamic: bid on LIVE project
PROJECT=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
(async () => {
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({
    where: { status: 'LIVE' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!proj) { console.log('NONE'); return; }
  const top = proj.bids[0]?.amount;
  const min = top ? Number(top) + Number(proj.bidStep) : Number(proj.startPrice);
  console.log(proj.id + '|' + min);
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [ "$PROJECT" != "NONE" ] && [ -n "$PROJECT" ]; then
  PID=$(echo "$PROJECT" | cut -d"|" -f1)
  MIN=$(echo "$PROJECT" | cut -d"|" -f2)
  check "bid LIVE project" "200" "$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN}")"
else
  echo "FAIL: bid LIVE project (no LIVE auction found)"
  FAIL=$((FAIL + 1))
fi

# Dynamic: drying reserve
LISTING=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
(async () => {
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(l?.id ?? 'NONE');
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [ "$LISTING" != "NONE" ] && [ -n "$LISTING" ]; then
  START=$(date -d "+10 days" +%Y-%m-%d 2>/dev/null || date -v+10d +%Y-%m-%d)
  END=$(date -d "+11 days" +%Y-%m-%d 2>/dev/null || date -v+11d +%Y-%m-%d)
  check "drying reserve" "200" "$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" -d "{\"listingId\":\"$LISTING\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")"
else
  echo "FAIL: drying reserve (no OPERATING listing found)"
  FAIL=$((FAIL + 1))
fi

echo "---"
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
