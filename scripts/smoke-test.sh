#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/sishi-smoke-cookies.txt"
FAIL=0

pass() { echo "  OK: $1"; }
fail() { echo "  FAIL: $1 — $2"; FAIL=1; }

echo "=== Smoke test @ $BASE ==="

# Pages
for path in "/" "/m" "/m/login" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [[ "$code" == "200" ]]; then pass "GET $path ($code)"; else fail "GET $path" "status $code"; fi
done

# Dev third-party token
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test_user")
TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)
if [[ -n "$TOKEN" ]]; then pass "dev third-party token"; else fail "dev third-party token" "$TOKEN_RESP"; fi

# Third-party login
rm -f "$COOKIE_JAR"
SSO_CODE=$(curl -s -c "$COOKIE_JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
if [[ "$SSO_CODE" == "200" ]]; then pass "POST /api/auth/third-party"; else fail "third-party login" "status $SSO_CODE"; fi

# User login
rm -f "$COOKIE_JAR"
USER_LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
if echo "$USER_LOGIN" | grep -q '"ok":true'; then pass "user login"; else fail "user login" "$USER_LOGIN"; fi

# Admin login
ADMIN_JAR="/tmp/sishi-admin-cookies.txt"
rm -f "$ADMIN_JAR"
ADMIN_LOGIN=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ADMIN_LOGIN" | grep -q '"ok":true'; then pass "admin login"; else fail "admin login" "$ADMIN_LOGIN"; fi

# Admin assets page has dict-driven form options
ASSET_OPTS=$(curl -s -b "$ADMIN_JAR" "$BASE/admin/assets/new" | grep -c '<option value=' || true)
if [[ "${ASSET_OPTS:-0}" -gt 0 ]]; then pass "admin asset form options ($ASSET_OPTS)"; else fail "admin asset form" "no select options (run db:seed for dict)"; fi

# Drying reserve
LISTING_ID=$(cd /workspace && npx tsx -e "
import { prisma } from './src/lib/prisma';
prisma.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { console.log(r?.id ?? ''); })
  .finally(() => prisma.\$disconnect());
" 2>/dev/null | tail -1)
if [[ -n "$LISTING_ID" ]]; then
  START=$(date -u +%Y-%m-%d)
  END=$(date -u -d "+2 days" +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  RESERVE=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  if echo "$RESERVE" | grep -q '"ok":true'; then pass "drying reserve"; else fail "drying reserve" "$RESERVE"; fi
else
  fail "drying reserve" "no OPERATING listing"
fi

# Auction bid (needs LIVE project)
PROJECT_ID=$(cd /workspace && npx tsx -e "
import { prisma } from './src/lib/prisma';
prisma.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then(r => { console.log(r?.id ?? ''); })
  .finally(() => prisma.\$disconnect());
" 2>/dev/null | tail -1)
if [[ -n "$PROJECT_ID" ]]; then
  MIN_BID=$(cd /workspace && npx tsx -e "
import { prisma } from './src/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
async function main() {
  const p = await prisma.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
  const top = await prisma.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
  const min = top
    ? new Decimal(top.amount.toString()).plus(p!.bidStep.toString())
    : new Decimal(p!.startPrice.toString());
  console.log(min.toFixed(2));
}
main().finally(() => prisma.\$disconnect());
" 2>/dev/null | tail -1)
  BID=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  if echo "$BID" | grep -q '"ok":true'; then pass "auction bid ($MIN_BID)"; else fail "auction bid" "$BID"; fi
else
  echo "  SKIP: auction bid (no LIVE project — run npm run db:seed)"
fi

# Register validation
REG=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" -d '{"phone":"invalid","password":"x"}')
if echo "$REG" | grep -q 'error'; then pass "register validation"; else fail "register validation" "$REG"; fi

echo "=== Done (failures: $FAIL) ==="
exit "$FAIL"
