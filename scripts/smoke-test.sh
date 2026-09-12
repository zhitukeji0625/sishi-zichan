#!/usr/bin/env bash
# API smoke tests — run against `npm run dev` (localhost:3000)
set -euo pipefail
BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=/tmp/smoke_admin_cookies.txt
USER_JAR=/tmp/smoke_user_cookies.txt
rm -f "$COOKIE_JAR" "$USER_JAR"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name expected=$expected got=$actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== API Smoke Tests ($BASE) ==="

check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "GET /m/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"

check "POST /api/auth/admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')"

check "GET /admin (authed)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/admin")"

check "POST /api/auth/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')"

PHONE="199$(date +%s | tail -c 9)"
check "POST /api/auth/register" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"password\":\"user123\",\"name\":\"冒烟测试\"}")"

check "GET /api/dev/third-party-token" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test123")"

check "POST /api/upload (no auth)" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" \
  -H 'Content-Type: application/json' -d '{}')"

check "POST /api/upload (non-multipart)" 400 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/upload" \
  -H 'Content-Type: application/json' -d '{}')"

check "POST /api/admin/assets (non-multipart)" 400 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/admin/assets" \
  -H 'Content-Type: application/json' -d '{}')"

LIVE_PROJECT=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
  console.log(proj?.id ?? 'none');
  await p.\$disconnect();
})();
" 2>/dev/null)
echo "LIVE project: $LIVE_PROJECT"

check "POST bid (no auth)" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/${LIVE_PROJECT}/bid" \
  -H 'Content-Type: application/json' -d '{"amount":100}')"

if [ "$LIVE_PROJECT" != "none" ] && [ -n "$LIVE_PROJECT" ]; then
  BID_AMT=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findUnique({
    where: { id: '$LIVE_PROJECT' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!proj) { console.log('0'); return; }
  const top = proj.bids[0]?.amount;
  const min = top ? Number(top) + Number(proj.bidStep) : Number(proj.startPrice);
  console.log(min);
  await p.\$disconnect();
})();
" 2>/dev/null)
  echo "Min bid: $BID_AMT"
  check "POST bid (authed)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_JAR" -X POST "$BASE/api/m/auction/${LIVE_PROJECT}/bid" \
    -H 'Content-Type: application/json' -d "{\"amount\":$BID_AMT}")"
else
  echo "✗ No LIVE auction project — run npm run db:seed"
  FAIL=$((FAIL + 1))
fi

LISTING=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(l?.id ?? 'none');
  await p.\$disconnect();
})();
" 2>/dev/null)
echo "Listing: $LISTING"

if [ "$LISTING" != "none" ] && [ -n "$LISTING" ]; then
  START=$(date -d '+3 days' +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d '+4 days' +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  check "POST /api/m/drying/reserve" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' -d "{\"listingId\":\"$LISTING\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")"
fi

check "GET /m" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /m/auction" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check "GET /m/drying" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
