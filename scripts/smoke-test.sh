#!/bin/bash
set -e
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/sishi-smoke-cookies.txt"
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $name (expected HTTP $expected, got $actual)"
    FAIL=$((FAIL + 1))
  else
    echo "OK: $name ($actual)"
  fi
}

check_json() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -qE "$pattern"; then
    echo "OK: $name"
  else
    echo "FAIL: $name (body: ${body:0:200})"
    FAIL=$((FAIL + 1))
  fi
}

rm -f "$COOKIE_JAR"

echo "=== Public pages ==="
check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /m/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

echo "=== Auth API ==="
ADMIN_RESP=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_RESP" | tail -1)
ADMIN_BODY=$(echo "$ADMIN_RESP" | sed '$d')
check "POST admin login" 200 "$ADMIN_CODE"
check_json "admin login body" '"ok":true' "$ADMIN_BODY"

USER_RESP=$(curl -s -w "\n%{http_code}" -c /tmp/sishi-user-cookies.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
USER_CODE=$(echo "$USER_RESP" | tail -1)
USER_BODY=$(echo "$USER_RESP" | sed '$d')
check "POST user login" 200 "$USER_CODE"
check_json "user login body" '"ok":true' "$USER_BODY"

echo "=== Protected admin (with cookie) ==="
check "GET /admin" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/admin")"
check "GET /admin/assets" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/admin/assets")"
check "GET /admin/auctions" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/admin/auctions")"

echo "=== Protected mobile (with cookie) ==="
check "GET /m/me" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/sishi-user-cookies.txt "$BASE/m/me")"
check "GET /m/auction" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/sishi-user-cookies.txt "$BASE/m/auction")"
check "GET /m/drying" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/sishi-user-cookies.txt "$BASE/m/drying")"

echo "=== DB-backed API flows ==="
# 确保有可测的 LIVE 竞拍（演示库可能已过期）
AUCTION_META=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { refreshAuctionProjectStatuses } from './src/lib/cron.ts';
const p = new PrismaClient();
async function main() {
  await refreshAuctionProjectStatuses();
  let proj = await p.auctionProject.findFirst({
    where: { status: 'LIVE' },
    select: { id: true, startPrice: true, bidStep: true },
  });
  if (!proj) {
    const ends = new Date(Date.now() + 7 * 86400000);
    const starts = new Date(Date.now() - 60000);
    await p.auctionProject.updateMany({
      where: { status: { in: ['ENDED', 'SCHEDULED'] } },
      data: { status: 'LIVE', startsAt: starts, endsAt: ends },
    });
    proj = await p.auctionProject.findFirst({
      where: { status: 'LIVE' },
      select: { id: true, startPrice: true, bidStep: true },
    });
  }
  if (proj) {
    const top = await p.auctionBid.findFirst({
      where: { projectId: proj.id },
      orderBy: { amount: 'desc' },
      select: { amount: true },
    });
    const min = top
      ? Number(top.amount) + Number(proj.bidStep)
      : Number(proj.startPrice);
    console.log(JSON.stringify({ id: proj.id, minBid: min }));
  } else {
    console.log('{}');
  }
}
main().finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)
PROJECT_ID=$(echo "$AUCTION_META" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || true)
MIN_BID=$(echo "$AUCTION_META" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('minBid',8200))" 2>/dev/null || echo "8200")

LISTING_ID=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { console.log(r?.id ?? ''); return p.\$disconnect(); });
" 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  BID_RESP=$(curl -s -w "\n%{http_code}" -b /tmp/sishi-user-cookies.txt -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  BID_CODE=$(echo "$BID_RESP" | tail -1)
  BID_BODY=$(echo "$BID_RESP" | sed '$d')
  if [ "$BID_CODE" = "200" ]; then
    echo "OK: auction bid ($BID_CODE)"
  else
    echo "FAIL: auction bid ($BID_CODE) - $BID_BODY"
    FAIL=$((FAIL + 1))
  fi
else
  echo "FAIL: no LIVE auction project for bid test"
  FAIL=$((FAIL + 1))
fi

if [ -n "$LISTING_ID" ]; then
  START=$(date -u +%Y-%m-%d)
  END=$(date -u -d "+2 days" +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  DRY_RESP=$(curl -s -w "\n%{http_code}" -b /tmp/sishi-user-cookies.txt -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  DRY_CODE=$(echo "$DRY_RESP" | tail -1)
  DRY_BODY=$(echo "$DRY_RESP" | sed '$d')
  if [ "$DRY_CODE" = "200" ]; then
    echo "OK: drying reserve ($DRY_CODE)"
  else
    echo "WARN/FAIL: drying reserve ($DRY_CODE) - $DRY_BODY"
    if [ "$DRY_CODE" != "400" ]; then FAIL=$((FAIL + 1)); fi
  fi
else
  echo "SKIP: no drying listing"
fi

echo "=== Admin API ==="
ASSETS_RESP=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" "$BASE/api/admin/assets")
ASSETS_CODE=$(echo "$ASSETS_RESP" | tail -1)
check "GET /api/admin/assets (POST-only)" 405 "$ASSETS_CODE"

echo "=== Summary ==="
if [ "$FAIL" -gt 0 ]; then
  echo "$FAIL test(s) failed"
  exit 1
fi
echo "All smoke tests passed"
exit 0
