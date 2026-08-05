#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
PASS=0
FAIL=0

check() {
  local name="$1" expect="$2" actual="$3"
  if [[ "$actual" == *"$expect"* ]]; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected: $expect, got: ${actual:0:200})"
    FAIL=$((FAIL + 1))
  fi
}

check_status() {
  local name="$1" expect="$2" actual="$3"
  if [[ "$actual" == "$expect" ]]; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected status $expect, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

# 1. Home page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check_status "GET /" "200" "$code"

# 2. Mobile login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")
check_status "GET /m/login" "200" "$code"

# 3. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check_status "GET /admin/login" "200" "$code"

# 4. User login API
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check_status "POST /api/auth/login" "200" "$code"
check "login response ok" '"ok":true' "$body"

# 5. Admin login API
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check_status "POST /api/auth/admin/login" "200" "$code"
check "admin login response ok" '"ok":true' "$body"

# 6. Third-party SSO token
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test_user")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check_status "GET /api/dev/third-party-token" "200" "$code"
TOKEN=$(echo "$body" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

# 7. Third-party auth
SSO_JAR=$(mktemp)
resp=$(curl -s -w "\n%{http_code}" -c "$SSO_JAR" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check_status "POST /api/auth/third-party" "200" "$code"
check "third-party auth ok" '"ok":true' "$body"

# 8. Mobile pages (authenticated)
for path in /m /m/auction /m/drying /m/me /m/orders; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

# 9. Admin pages (authenticated)
for path in /admin /admin/assets /admin/auctions /admin/dict /admin/drying; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

# 10. Dict data exists (admin dict page should show categories)
html=$(curl -s -b "$ADMIN_JAR" "$BASE/admin/dict")
check "dict page has asset_type" "asset_type" "$html"

# 11. Auction bid (need LIVE project)
BID_INFO=$(cd /workspace && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const { Decimal } = await import('@prisma/client/runtime/library');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' } });
  if (!proj) { console.log(''); await p.\$disconnect(); return; }
  const top = await p.auctionBid.findFirst({ where: { projectId: proj.id }, orderBy: { amount: 'desc' } });
  const minNext = top
    ? new Decimal(top.amount.toString()).plus(proj.bidStep.toString())
    : new Decimal(proj.startPrice.toString());
  console.log(proj.id + '|' + minNext.toString());
  await p.\$disconnect();
})();
" 2>/dev/null)

PROJECT_ID=$(echo "$BID_INFO" | cut -d'|' -f1)
MIN_BID=$(echo "$BID_INFO" | cut -d'|' -f2)

if [[ -n "$PROJECT_ID" ]]; then
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check_status "POST bid" "200" "$code"
  check "bid response ok" '"ok":true' "$body"
else
  echo "✗ No LIVE auction project for bid test"
  FAIL=$((FAIL + 1))
fi

# 12. Drying reservation
LISTING_ID=$(cd /workspace && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [[ -n "$LISTING_ID" ]]; then
  START=$(date -u -d "+2 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+2d +%Y-%m-%dT00:00:00.000Z)
  END=$(date -u -d "+3 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+3d +%Y-%m-%dT00:00:00.000Z)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check_status "POST drying reserve" "200" "$code"
  check "reserve response ok" '"ok":true' "$body"
else
  echo "✗ No OPERATING drying listing for reserve test"
  FAIL=$((FAIL + 1))
fi

rm -f "$COOKIE_JAR" "$ADMIN_JAR" "$SSO_JAR"
echo ""
echo "Results: $PASS passed, $FAIL failed"
exit $([[ $FAIL -eq 0 ]] && echo 0 || echo 1)
