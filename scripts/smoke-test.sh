#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1" expect="$2"
  shift 2
  local code
  code=$(eval "$@" 2>/dev/null | tail -1)
  if [ "$code" = "$expect" ]; then
    echo "PASS $name ($code)"
    PASS=$((PASS + 1))
  else
    echo "FAIL $name expected=$expect got=$code"
    FAIL=$((FAIL + 1))
  fi
}

check "homepage" 200 "curl -s -o /dev/null -w %{http_code} $BASE/"
check "admin login page" 200 "curl -s -o /dev/null -w %{http_code} $BASE/admin/login"
check "m home" 200 "curl -s -o /dev/null -w %{http_code} $BASE/m"
check "m login" 200 "curl -s -o /dev/null -w %{http_code} $BASE/m/login"
check "m auction" 200 "curl -s -o /dev/null -w %{http_code} $BASE/m/auction"
check "m drying" 200 "curl -s -o /dev/null -w %{http_code} $BASE/m/drying"
check "dev token" 200 "curl -s -o /dev/null -w %{http_code} $BASE/api/dev/third-party-token?u_id=testuser"

ADMIN_COOKIE=$(mktemp)
curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' > /dev/null

check "admin login API" 200 "curl -s -o /dev/null -w %{http_code} -b $ADMIN_COOKIE -X POST $BASE/api/auth/admin/login -H \"Content-Type: application/json\" -d '{\"phone\":\"13900000001\",\"password\":\"admin123\"}'"
check "admin dashboard" 200 "curl -s -o /dev/null -w %{http_code} -b $ADMIN_COOKIE $BASE/admin"
check "admin dict" 200 "curl -s -o /dev/null -w %{http_code} -b $ADMIN_COOKIE $BASE/admin/dict"
check "admin assets" 200 "curl -s -o /dev/null -w %{http_code} -b $ADMIN_COOKIE $BASE/admin/assets"
check "admin auctions" 200 "curl -s -o /dev/null -w %{http_code} -b $ADMIN_COOKIE $BASE/admin/auctions"

USER_COOKIE=$(mktemp)
curl -s -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' > /dev/null

check "user login API" 200 "curl -s -o /dev/null -w %{http_code} -c $USER_COOKIE -X POST $BASE/api/auth/login -H \"Content-Type: application/json\" -d '{\"phone\":\"13800138000\",\"password\":\"user123\"}'"
check "m me" 200 "curl -s -o /dev/null -w %{http_code} -b $USER_COOKIE $BASE/m/me"

UPLOAD_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d "{}")
if [ "$UPLOAD_CODE" = "400" ]; then
  echo "PASS upload non-multipart (400)"
  PASS=$((PASS + 1))
else
  echo "FAIL upload non-multipart expected=400 got=$UPLOAD_CODE"
  FAIL=$((FAIL + 1))
fi

UPLOAD_NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" -H "Content-Type: multipart/form-data")
if [ "$UPLOAD_NOAUTH" = "401" ]; then
  echo "PASS upload no auth (401)"
  PASS=$((PASS + 1))
else
  echo "FAIL upload no auth expected=401 got=$UPLOAD_NOAUTH"
  FAIL=$((FAIL + 1))
fi

AUCTION_INFO=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const a = await p.auctionProject.findFirst({ where: { status: 'LIVE' } });
  if (!a) { console.log(''); await p.\$disconnect(); return; }
  const top = await p.auctionBid.findFirst({ where: { projectId: a.id }, orderBy: { amount: 'desc' } });
  const start = Number(a.startPrice);
  const step = Number(a.bidStep);
  const min = top ? Number(top.amount) + step : start;
  console.log(a.id + ' ' + min);
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

AUCTION_ID=$(echo "$AUCTION_INFO" | awk '{print $1}')
MIN_BID=$(echo "$AUCTION_INFO" | awk '{print $2}')

if [ -n "$AUCTION_ID" ] && [ -n "$MIN_BID" ]; then
  BID_RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  if echo "$BID_RESP" | grep -q '"ok":true'; then
    echo "PASS auction bid"
    PASS=$((PASS + 1))
  else
    echo "FAIL auction bid: $BID_RESP"
    FAIL=$((FAIL + 1))
  fi
else
  echo "FAIL no LIVE auction found"
  FAIL=$((FAIL + 1))
fi

DICT_COUNT=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  console.log(await p.dictCategory.count());
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [ "${DICT_COUNT:-0}" -ge 14 ]; then
  echo "PASS dict categories ($DICT_COUNT)"
  PASS=$((PASS + 1))
else
  echo "FAIL dict categories expected>=14 got=${DICT_COUNT:-0}"
  FAIL=$((FAIL + 1))
fi

echo "=== Results: $PASS passed, $FAIL failed ==="
exit "$FAIL"
