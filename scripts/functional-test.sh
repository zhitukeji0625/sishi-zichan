#!/usr/bin/env bash
# API smoke tests — requires server on http://localhost:3000
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
USER_JAR="/tmp/ft-user-cookies.txt"
ADMIN_JAR="/tmp/ft-admin-cookies.txt"
rm -f "$USER_JAR" "$ADMIN_JAR"

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

query_db() {
  cd "$(dirname "$0")/.." && node --import tsx -e "$1"
}

# --- public pages ---
check "GET /" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /admin/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

# --- auth ---
check "POST /api/auth/login (empty)" "400" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{}')"

check "POST /api/auth/login (user)" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' -c "$USER_JAR" -b "$USER_JAR" -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')"

check "POST /api/auth/admin/login" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
    -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')"

check "GET /m/auction" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_JAR" "$BASE/m/auction")"

# --- auction bid ---
PROJECT_ID=$(query_db "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
  process.stdout.write(proj?.id ?? '');
  await p.\$disconnect();
})();
")

if [ -n "$PROJECT_ID" ]; then
  MIN_BID=$(query_db "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const { Decimal } = await import('@prisma/client/runtime/library');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findUnique({
    where: { id: '$PROJECT_ID' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!proj) process.stdout.write('0');
  else if (proj.bids.length === 0) process.stdout.write(proj.startPrice.toString());
  else process.stdout.write(proj.bids[0].amount.add(proj.bidStep).toString());
  await p.\$disconnect();
})();
")
  BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}")
  if echo "$BID_RESP" | grep -q '"ok":true'; then
    echo "✓ POST /api/m/auction/bid ($MIN_BID)"
    PASS=$((PASS + 1))
  else
    echo "✗ POST /api/m/auction/bid: $BID_RESP"
    FAIL=$((FAIL + 1))
  fi
else
  echo "✗ No LIVE auction project found"
  FAIL=$((FAIL + 1))
fi

# --- drying reservation ---
LISTING_ID=$(query_db "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  process.stdout.write(l?.id ?? '');
  await p.\$disconnect();
})();
")

if [ -n "$LISTING_ID" ]; then
  DRY_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-07-01\",\"endDate\":\"2026-07-03\"}")
  if echo "$DRY_RESP" | grep -q '"ok":true'; then
    echo "✓ POST /api/m/drying/reserve"
    PASS=$((PASS + 1))
  else
    echo "✗ POST /api/m/drying/reserve: $DRY_RESP"
    FAIL=$((FAIL + 1))
  fi
else
  echo "✗ No drying listing found"
  FAIL=$((FAIL + 1))
fi

# --- admin API guards ---
check "POST /api/admin/assets (no auth)" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{}')"

check "POST /api/admin/assets (JSON not multipart)" "400" \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
    -H 'Content-Type: application/json' -d '{}')"

check "POST /api/upload (no auth)" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload")"

check "GET /api/dev/third-party-token (prod)" "404" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test")"

check "GET /admin (with auth)" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -L "$BASE/admin")"

echo ""
echo "Results: $PASS passed, $FAIL failed"
exit "$FAIL"
