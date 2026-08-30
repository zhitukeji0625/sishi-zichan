#!/usr/bin/env bash
# End-to-end smoke test for sishi-zichan (requires dev server on :3000 and seeded DB)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); echo "✓ $1"; }
bad() { FAIL=$((FAIL + 1)); echo "✗ $1"; }

echo "=== Smoke test against $BASE ==="

# Public pages
for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  [ "$code" = "200" ] && ok "GET $path -> $code" || bad "GET $path -> $code (expected 200)"
done

# User login
USER_COOKIE=$(mktemp)
RESP=$(curl -s -c "$USER_COOKIE" -b "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$RESP" | grep -q '"ok":true' && ok "User login" || bad "User login: $RESP"

# Admin login
ADMIN_COOKIE=$(mktemp)
RESP=$(curl -s -c "$ADMIN_COOKIE" -b "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$RESP" | grep -q '"ok":true' && ok "Admin login" || bad "Admin login: $RESP"

# Admin pages
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/dict" "/admin/drying" "/admin/organizations"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE$path")
  [ "$code" = "200" ] && ok "GET $path (admin) -> $code" || bad "GET $path (admin) -> $code"
done

# Dict categories exist
DICT_RESP=$(curl -s -b "$ADMIN_COOKIE" "$BASE/admin/dict")
echo "$DICT_RESP" | grep -q "asset_type" && ok "Dict categories present" || bad "Dict categories missing on /admin/dict"

# Auction bid (query DB for LIVE project and min bid)
BID_INFO=$(cd "$(dirname "$0")/.." && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const proj = await p.auctionProject.findFirst({
    where: { status: 'LIVE' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!proj) { console.log('NONE'); process.exit(0); }
  const top = proj.bids[0]?.amount;
  const min = top ? Number(top) + Number(proj.bidStep) : Number(proj.startPrice);
  console.log(proj.id + ' ' + min);
  await p.\$disconnect();
})();
")
if [ "$BID_INFO" = "NONE" ]; then
  bad "No LIVE auction project for bid test"
else
  PROJECT_ID=$(echo "$BID_INFO" | awk '{print $1}')
  BID_AMT=$(echo "$BID_INFO" | awk '{print $2}')
  ok "Found LIVE auction: $PROJECT_ID (min bid $BID_AMT)"
  BID_RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$BID_AMT}")
  echo "$BID_RESP" | grep -q '"ok":true' && ok "Place bid $BID_AMT" || bad "Place bid: $BID_RESP"
fi

# Drying listing page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" "$BASE/m/drying")
[ "$code" = "200" ] && ok "GET /m/drying (user) -> $code" || bad "GET /m/drying (user) -> $code"

# Dev third-party token
TP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test123")
echo "$TP" | grep -q 'token' && ok "Dev third-party token" || bad "Dev third-party token: $TP"

# Favicon / icon
ICON_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/icon")
[ "$ICON_CODE" = "200" ] && ok "GET /icon -> $ICON_CODE" || bad "GET /icon -> $ICON_CODE"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
