#!/usr/bin/env bash
# 冒烟测试：关键页面与 API
set -euo pipefail
BASE="${BASE_URL:-http://127.0.0.1:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

check_http() {
  local method="$1" url="$2" expected="$3"
  local extra=()
  shift 3
  while [[ $# -gt 0 ]]; do
    extra+=("$1")
    shift
  done
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "${extra[@]}" "$url")
  if [[ "$code" != "$expected" ]]; then
    echo "FAIL $method $url expected $expected got $code"
    FAIL=$((FAIL + 1))
  else
    echo "OK   $method $url -> $code"
  fi
}

echo "=== Pages ==="
check_http GET "$BASE/" 200
check_http GET "$BASE/m" 200
check_http GET "$BASE/m/login" 200
check_http GET "$BASE/admin/login" 200

echo "=== User auth ==="
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$LOGIN" | grep -q '"ok":true\|"success":true\|"user"'; then
  echo "OK   POST /api/auth/login"
else
  echo "FAIL POST /api/auth/login: $LOGIN"
  FAIL=$((FAIL + 1))
fi

echo "=== Admin auth ==="
ALOGIN=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ALOGIN" | grep -qE '"ok":true|"success":true|"admin"'; then
  echo "OK   POST /api/auth/admin/login"
else
  echo "FAIL POST /api/auth/admin/login: $ALOGIN"
  FAIL=$((FAIL + 1))
fi

echo "=== Protected admin page (with cookie) ==="
check_http GET "$BASE/admin" 200 -b "$ADMIN_JAR"

echo "=== Dev third-party token ==="
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
if echo "$TOKEN_RESP" | grep -q 'token'; then
  echo "OK   GET /api/dev/third-party-token"
else
  echo "FAIL GET /api/dev/third-party-token: $TOKEN_RESP"
  FAIL=$((FAIL + 1))
fi

echo "=== Auction list page ==="
check_http GET "$BASE/m/auction" 200 -b "$COOKIE_JAR"

echo "=== Auction bid (demo LIVE project) ==="
PROJECT_ID=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const u = await p.endUser.findUnique({ where: { phone: '13800138000' } });
  const proj = await p.auctionProject.findFirst({
    where: {
      status: 'LIVE',
      registrations: {
        some: { endUserId: u?.id, status: 'APPROVED', depositPaid: true },
      },
    },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!proj) { console.log(''); process.exit(0); }
  const top = proj.bids[0]?.amount?.toString() ?? proj.startPrice.toString();
  const step = proj.bidStep.toString();
  const next = (parseFloat(top) + parseFloat(step)).toFixed(2);
  console.log(proj.id + '|' + next);
  await p.\$disconnect();
})().catch(() => process.exit(1));
" 2>/dev/null || true)
if [[ -n "$PROJECT_ID" && "$PROJECT_ID" == *"|"* ]]; then
  PID="${PROJECT_ID%%|*}"
  AMOUNT="${PROJECT_ID#*|}"
  BID=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$AMOUNT}")
  if echo "$BID" | grep -q '"ok":true'; then
    echo "OK   POST /api/m/auction/$PID/bid amount=$AMOUNT"
  else
    echo "FAIL POST /api/m/auction/$PID/bid: $BID"
    FAIL=$((FAIL + 1))
  fi
else
  echo "SKIP auction bid (no LIVE demo project; run npm run db:seed)"
fi

rm -f "$COOKIE_JAR" "$ADMIN_JAR"
if [[ $FAIL -gt 0 ]]; then
  echo "Smoke tests failed: $FAIL error(s)"
  exit 1
fi
echo "All smoke tests passed."
