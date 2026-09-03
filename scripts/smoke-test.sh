#!/usr/bin/env bash
# Functional smoke test — run from repo root: npm run test:smoke
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/smoke_cookies.txt"
USER_JAR="/tmp/smoke_user_cookies.txt"
rm -f "$COOKIE_JAR" "$USER_JAR"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "FAIL: $name (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' \
  -c "$COOKIE_JAR")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check "POST /api/auth/admin/login" "200" "$code"
echo "$body" | grep -q '"ok":true' && check "admin login ok" "true" "true" || check "admin login ok" "true" "false"

for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/dict" "/admin/drying" "/admin/announcements"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  check "GET $path (auth)" "200" "$code"
done

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' \
  -c "$USER_JAR")
code=$(echo "$resp" | tail -1)
check "POST /api/auth/login" "200" "$code"

for path in "/m/me" "/m/orders" "/m/auction"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" "$BASE$path")
  check "GET $path (user)" "200" "$code"
done

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -b "$COOKIE_JAR" "$BASE/api/upload")
check "POST /api/upload no file" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
check "POST /api/upload no auth" "401" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test123")
check "GET /api/dev/third-party-token" "200" "$code"

PROJECT_ID=$(npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' } });
  console.log(proj?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [ -n "$PROJECT_ID" ]; then
  MIN_BID=$(npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const { Decimal } = await import('@prisma/client/runtime/library');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
  const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
  const min = top ? new Decimal(top.amount.toString()).plus(proj.bidStep.toString()) : new Decimal(proj.startPrice.toString());
  console.log(min.toFixed(2));
  await p.\$disconnect();
})();
" 2>/dev/null)
  resp=$(curl -s -w "\n%{http_code}" -X POST -b "$USER_JAR" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}" \
    "$BASE/api/m/auction/$PROJECT_ID/bid")
  code=$(echo "$resp" | tail -1)
  check "POST bid" "200" "$code"
else
  echo "FAIL: No LIVE auction project found"
  FAIL=$((FAIL+1))
fi

DICT_COUNT=$(npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  console.log(await p.dictCategory.count());
  await p.\$disconnect();
})();
" 2>/dev/null)

if [ "$DICT_COUNT" -gt 0 ]; then
  check "dict categories exist" "true" "true"
else
  check "dict categories exist" "true" "false"
fi

echo ""
echo "=== RESULTS: $PASS passed, $FAIL failed ==="
exit "$FAIL"
