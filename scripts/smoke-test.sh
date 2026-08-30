#!/usr/bin/env bash
# Smoke test for sishi-zichan — run with dev server on localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_DIR=$(mktemp -d)
trap 'rm -rf "$COOKIE_DIR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_contains() {
  local name="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (missing: $needle)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test: $BASE ==="

# 1. Public pages
for path in "/" "/m" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# 2. Admin login
ADMIN_RESP=$(curl -s -c "$COOKIE_DIR/admin.txt" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_contains "Admin login ok" '"ok":true' "$ADMIN_RESP"

# 3. User login
USER_RESP=$(curl -s -c "$COOKIE_DIR/user.txt" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_contains "User login ok" '"ok":true' "$USER_RESP"

# 4. Admin dict has categories
DICT_HTML=$(curl -s -b "$COOKIE_DIR/admin.txt" "$BASE/admin/dict")
check_contains "Admin dict has asset_type" "asset_type" "$DICT_HTML"

# 5. Admin assets page
ASSETS_CODE=$(curl -s -b "$COOKIE_DIR/admin.txt" -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
check "GET /admin/assets" "200" "$ASSETS_CODE"

# 6. Auction list page
AUCTION_HTML=$(curl -s -b "$COOKIE_DIR/user.txt" "$BASE/m/auction")
check "GET /m/auction" "200" "$(curl -s -b "$COOKIE_DIR/user.txt" -o /dev/null -w "%{http_code}" "$BASE/m/auction")"

# 7. Trigger layout refresh (demo auction restore)
curl -s -o /dev/null "$BASE/m"

# 8. Get live project id and min bid
PROJECT_INFO=$(cd "$(dirname "$0")/.." && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const project = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
  if (!project) { console.log('NONE'); await p.\$disconnect(); return; }
  const top = await p.auctionBid.findFirst({ where: { projectId: project.id }, orderBy: { amount: 'desc' } });
  const min = top ? Number(top.amount) + Number(project.bidStep) : Number(project.startPrice);
  console.log(project.id + ' ' + min);
  await p.\$disconnect();
})();
")
PROJECT_ID=$(echo "$PROJECT_INFO" | awk '{print $1}')
MIN_BID=$(echo "$PROJECT_INFO" | awk '{print $2}')

if [[ "$PROJECT_ID" == "NONE" || -z "$PROJECT_ID" ]]; then
  echo "  ✗ No LIVE auction project found"
  FAIL=$((FAIL + 1))
else
  check_contains "Found LIVE auction" "$PROJECT_ID" "$PROJECT_ID"
  BID_RESP=$(curl -s -b "$COOKIE_DIR/user.txt" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  check_contains "Place bid ok" '"ok":true' "$BID_RESP"
fi

# 9. Drying reserve
LISTING_ID=$(cd "$(dirname "$0")/.." && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } }).then(l => { console.log(l?.id ?? 'NONE'); return p.\$disconnect(); });
")
if [[ "$LISTING_ID" != "NONE" && -n "$LISTING_ID" ]]; then
  DRY_RESP=$(curl -s -b "$COOKIE_DIR/user.txt" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-09-01\",\"endDate\":\"2026-09-02\"}")
  check_contains "Drying reserve ok" '"ok":true' "$DRY_RESP"
else
  echo "  ✗ No operating drying listing"
  FAIL=$((FAIL + 1))
fi

# 10. Third-party dev token
TP_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test")
check_contains "Third-party token" '"token"' "$TP_RESP"

# 11. SSO page
SSO_TOKEN=$(echo "$TP_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.token||'')})")
SSO_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$SSO_TOKEN")
check "GET /m/sso" "200" "$SSO_CODE"

# 12. User me page
ME_CODE=$(curl -s -b "$COOKIE_DIR/user.txt" -o /dev/null -w "%{http_code}" "$BASE/m/me")
check "GET /m/me" "200" "$ME_CODE"

# 13. Drying page
DRYING_CODE=$(curl -s -b "$COOKIE_DIR/user.txt" -o /dev/null -w "%{http_code}" "$BASE/m/drying")
check "GET /m/drying" "200" "$DRYING_CODE"

# 14. Orders page
ORDERS_CODE=$(curl -s -b "$COOKIE_DIR/user.txt" -o /dev/null -w "%{http_code}" "$BASE/m/orders")
check "GET /m/orders" "200" "$ORDERS_CODE"

# 15. Admin auctions
AUC_ADMIN=$(curl -s -b "$COOKIE_DIR/admin.txt" -o /dev/null -w "%{http_code}" "$BASE/admin/auctions")
check "GET /admin/auctions" "200" "$AUC_ADMIN"

# 16. Admin drying
DRY_ADMIN=$(curl -s -b "$COOKIE_DIR/admin.txt" -o /dev/null -w "%{http_code}" "$BASE/admin/drying")
check "GET /admin/drying" "200" "$DRY_ADMIN"

# 17. Favicon
FAV_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/favicon.ico")
check "GET /favicon.ico" "200" "$FAV_CODE"

# 18. Logout endpoints
ADMIN_LOGOUT=$(curl -s -b "$COOKIE_DIR/admin.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/logout")
check "POST /api/auth/admin/logout" "200" "$ADMIN_LOGOUT"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
