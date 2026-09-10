#!/usr/bin/env bash
# API smoke tests — run against `npm run dev` on localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR" "$USER_JAR"' EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name — expected $expected, got $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_body_contains() {
  local name="$1" needle="$2" body="$3"
  if echo "$body" | grep -q "$needle"; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name — body missing '$needle'"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests @ $BASE ==="

# --- Public pages ---
echo "[Pages]"
for path in "/" "/m" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE$path" || echo "000")
  assert_status "GET $path" "200" "$code"
done

# --- Auth: admin login ---
echo "[Admin auth]"
ADMIN_RESP=$(curl -sf -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_body_contains "admin login ok" '"ok":true' "$ADMIN_RESP"

ADMIN_BAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"wrong"}')
assert_status "admin login wrong password" "401" "$ADMIN_BAD"

ADMIN_EMPTY=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{}')
assert_status "admin login empty body" "400" "$ADMIN_EMPTY"

# --- Auth: user login ---
echo "[User auth]"
USER_RESP=$(curl -sf -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_body_contains "user login ok" '"ok":true' "$USER_RESP"

# --- Auth: register ---
echo "[Register]"
REG_PHONE="199$(date +%s | tail -c 10)"
REG_RESP=$(curl -sf -c "$COOKIE_JAR" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$REG_PHONE\",\"password\":\"test1234\",\"name\":\"冒烟用户\"}")
assert_body_contains "register ok" '"ok":true' "$REG_RESP"

REG_DUP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$REG_PHONE\",\"password\":\"test1234\"}")
assert_status "register duplicate" "409" "$REG_DUP"

# --- Upload / assets: non-multipart should return 400 ---
echo "[Multipart validation]"
UPLOAD_NO_MP=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"file":"x"}')
assert_status "upload non-multipart" "400" "$UPLOAD_NO_MP"

ASSET_NO_MP=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"test"}')
assert_status "assets non-multipart" "400" "$ASSET_NO_MP"

UPLOAD_NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
assert_status "upload no auth" "401" "$UPLOAD_NO_AUTH"

# --- Auction bid ---
echo "[Auction]"
# Ensure at least one LIVE project
LIVE_PROJECT=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const proj = await p.auctionProject.findFirst({ orderBy: { createdAt: 'desc' } });
  if (proj) {
    await p.auctionProject.update({
      where: { id: proj.id },
      data: { status: 'LIVE', startsAt: new Date(Date.now()-60000), endsAt: new Date(Date.now()+7*86400000) },
    });
    console.log(proj.id);
  }
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [[ -n "$LIVE_PROJECT" ]]; then
  BID_NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$LIVE_PROJECT/bid" \
    -H "Content-Type: application/json" -d '{"amount":99999}')
  assert_status "bid no auth" "401" "$BID_NO_AUTH"

  BID_BAD=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/auction/$LIVE_PROJECT/bid" \
    -H "Content-Type: application/json" -d '{"amount":1}')
  assert_status "bid too low" "400" "$BID_BAD"

  MIN_BID=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
const p = new PrismaClient();
(async () => {
  const proj = await p.auctionProject.findUnique({ where: { id: '$LIVE_PROJECT' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } });
  if (!proj) { console.log('8200'); return; }
  const top = proj.bids[0]?.amount;
  const min = top ? new Decimal(top.toString()).plus(proj.bidStep.toString()) : new Decimal(proj.startPrice.toString());
  console.log(min.toFixed(2));
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

  BID_OK=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$LIVE_PROJECT/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  assert_body_contains "bid success" '"ok":true' "$BID_OK"
else
  echo "  ✗ no auction project found"
  FAIL=$((FAIL + 1))
fi

# --- Drying reservation ---
echo "[Drying]"
LISTING_ID=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [[ -n "$LISTING_ID" ]]; then
  DRY_NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-03\"}")
  assert_status "drying reserve no auth" "401" "$DRY_NO_AUTH"

  DRY_BAD=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" -d '{"listingId":"invalid","startDate":"2026-10-01","endDate":"2026-10-03"}')
  assert_status "drying invalid listing" "404" "$DRY_BAD"

  DRY_OK=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-12-01\",\"endDate\":\"2026-12-03\"}")
  assert_body_contains "drying reserve ok" '"ok":true' "$DRY_OK"
else
  echo "  ✗ no drying listing found"
  FAIL=$((FAIL + 1))
fi

# --- Dev third-party token ---
echo "[Dev tools]"
DEV_TOKEN=$(curl -sf "$BASE/api/dev/third-party-token?u_id=smoke-test" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || true)
if [[ -n "$DEV_TOKEN" ]]; then
  assert_body_contains "dev token" "token" "{\"token\":\"$DEV_TOKEN\"}"
else
  echo "  ✗ dev third-party token"
  FAIL=$((FAIL + 1))
fi

# --- Admin pages (with cookie) ---
echo "[Admin pages]"
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/organizations"; do
  code=$(curl -sf -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path" || echo "000")
  assert_status "GET $path (auth)" "200" "$code"
done

# --- Mobile pages (with cookie) ---
echo "[Mobile pages auth]"
for path in "/m/me" "/m/orders"; do
  code=$(curl -sf -o /dev/null -w "%{http_code}" -b "$USER_JAR" "$BASE$path" || echo "000")
  assert_status "GET $path (auth)" "200" "$code"
done

# --- Logout ---
echo "[Logout]"
LOGOUT=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/auth/logout")
assert_status "user logout" "200" "$LOGOUT"

ADMIN_LOGOUT=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
assert_status "admin logout" "200" "$ADMIN_LOGOUT"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
