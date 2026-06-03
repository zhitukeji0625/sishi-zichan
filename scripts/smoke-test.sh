#!/usr/bin/env bash
# API smoke tests for 四师资产租赁 platform
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

check_json() {
  local label="$1" resp="$2" expect="$3"
  if echo "$resp" | grep -q "$expect"; then pass "$label"; else fail "$label (got: $resp)"; fi
}

query_db() {
  node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const q = process.argv[1];
(async () => {
  let out = '';
  if (q === 'live_project') {
    const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
    out = proj?.id ?? '';
  } else if (q === 'listing') {
    const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
    out = l?.id ?? '';
  }
  console.log(out);
  await p.\$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
" "$1"
}

echo "=== Smoke tests @ $BASE ==="

# Public pages
for path in "/" "/m" "/m/login" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path -> $code"; else fail "GET $path -> $code"; fi
done

# Admin login
ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json "Admin login" "$ADMIN_RESP" '"ok":true'

# User login
USER_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_json "User login" "$USER_RESP" '"ok":true'

PROJECT_ID=$(query_db live_project)
if [ -n "$PROJECT_ID" ]; then
  BID_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":999999}')
  if echo "$BID_RESP" | grep -qE '"ok":true|"error"'; then pass "Auction bid endpoint"; else fail "Auction bid (got: $BID_RESP)"; fi
else
  fail "No LIVE auction project (run npm run db:seed)"
fi

LISTING_ID=$(query_db listing)
if [ -n "$LISTING_ID" ]; then
  START=$(date -u -d "+2 days" +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  END=$(date -u -d "+3 days" +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
  DRY_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  if echo "$DRY_RESP" | grep -qE '"ok":true|"error"'; then pass "Drying reserve endpoint"; else fail "Drying reserve (got: $DRY_RESP)"; fi
else
  fail "No OPERATING drying listing in DB"
fi

# Third-party token (dev GET)
TP_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test")
if echo "$TP_RESP" | grep -q '"token"'; then pass "Dev third-party token"; else fail "Dev third-party token (got: $TP_RESP)"; fi

# Admin assets API (POST only; expect 405 on GET)
ASSETS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/api/admin/assets")
if [ "$ASSETS_CODE" = "405" ]; then pass "Admin assets API rejects GET -> 405"; else fail "Admin assets API GET -> $ASSETS_CODE"; fi

# Unauthenticated bid should 401
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/test/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
if [ "$UNAUTH" = "401" ]; then pass "Unauthenticated bid -> 401"; else fail "Unauthenticated bid -> $UNAUTH"; fi

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "All smoke tests passed."
  exit 0
else
  echo "$FAIL test(s) failed."
  exit 1
fi
