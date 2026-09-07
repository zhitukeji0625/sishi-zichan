#!/usr/bin/env bash
# API smoke tests — run against a live dev server (npm run dev).
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_DIR=$(mktemp -d)
trap 'rm -rf "$COOKIE_DIR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "Smoke testing $BASE ..."
echo ""

check "homepage" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")"
check "admin login page" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")"
check "mobile home" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")"
check "admin dashboard redirect" "307" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")"
check "user login invalid" "400" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{}')"
check "admin login invalid" "400" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{}')"

ADMIN_RESP=$(curl -s -c "$COOKIE_DIR/admin.txt" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check_ok "admin login success" "$ADMIN_RESP"

USER_RESP=$(curl -s -c "$COOKIE_DIR/user.txt" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check_ok "user login success" "$USER_RESP"

check "bid without auth" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/test/bid" -H "Content-Type: application/json" -d '{"amount":100}')"
check "third-party token" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test_user")"
check "upload without auth" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")"

UPLOAD_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_DIR/admin.txt" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
check "upload non-multipart" "400" "$UPLOAD_CODE"

ASSET_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_DIR/admin.txt" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
check "asset create non-multipart" "400" "$ASSET_CODE"

# Trigger layout refresh (demo auction renewal)
curl -s -o /dev/null "$BASE/m"

PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
  console.log(proj?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [ -n "$PROJECT_ID" ]; then
  NEXT_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findUnique({
    where: { id: '$PROJECT_ID' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  const max = proj?.bids[0]?.amount ?? proj?.startPrice;
  console.log(Number(max) + Number(proj?.bidStep ?? 10));
  await p.\$disconnect();
})();
" 2>/dev/null)
  BID_RESP=$(curl -s -b "$COOKIE_DIR/user.txt" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$NEXT_BID}")
  check_ok "place bid" "$BID_RESP"
else
  echo "✗ no live auction project"
  FAIL=$((FAIL + 1))
fi

check "drying reserve no auth" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d '{}')"

LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ orderBy: { createdAt: 'desc' } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [ -n "$LISTING_ID" ]; then
  DRY_RESP=$(curl -s -b "$COOKIE_DIR/user.txt" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-05\"}")
  if echo "$DRY_RESP" | grep -qE '"ok":true|已预约|重复|冲突|已存在|名额'; then
    echo "✓ drying reserve"
    PASS=$((PASS + 1))
  else
    echo "✗ drying reserve: $DRY_RESP"
    FAIL=$((FAIL + 1))
  fi
else
  echo "⚠ no drying listing, skip"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
exit "$FAIL"
