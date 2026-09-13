#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp}"
ADMIN_COOKIE="$TMPDIR/smoke_admin_cookies.txt"
USER_COOKIE="$TMPDIR/smoke_user_cookies.txt"
rm -f "$ADMIN_COOKIE" "$USER_COOKIE"

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (expected $expected, got $actual) $body"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "  PASS $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests against $BASE ==="

# Pages
for path in "/" "/admin/login" "/m" "/m/auction" "/m/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "page $path" "200" "$code"
done

# Admin login
body=$(curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "admin login" "$body"

# User login
body=$(curl -s -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "user login" "$body"

# Register new user
PHONE="199$(date +%s | tail -c 9)"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟\"}")
assert_status "register" "200" "$code"

# Third-party token (dev only)
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke")
assert_status "third-party token" "200" "$code"

# Non-multipart upload -> 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" \
  -d '{"file":"x"}')
assert_status "upload non-multipart" "400" "$code"

# Non-multipart assets -> 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" \
  -d '{"name":"x"}')
assert_status "assets non-multipart" "400" "$code"

# Unauthenticated bid -> 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake-id/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":100}')
assert_status "bid unauthenticated" "401" "$code"

# Drying reserve unauthenticated -> 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"x","startDate":"2026-12-01","endDate":"2026-12-02"}')
assert_status "drying reserve unauthenticated" "401" "$code"

# Query LIVE project and bid
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const live = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } });
  if (!live) { console.log(''); process.exit(0); }
  const top = live.bids[0]?.amount;
  const min = top ? Number(top) + Number(live.bidStep) : Number(live.startPrice);
  console.log(live.id + '|' + min);
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [[ -z "$PROJECT_ID" ]]; then
  echo "  FAIL no LIVE auction project"
  FAIL=$((FAIL + 1))
else
  PID="${PROJECT_ID%%|*}"
  MIN_BID="${PROJECT_ID#*|}"
  body=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  assert_json_ok "place bid ($MIN_BID)" "$body"

  # Reject low bid
  LOW=$((MIN_BID - 1))
  body=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$LOW}")
  if echo "$body" | grep -q '"error"'; then
    echo "  PASS reject low bid"
    PASS=$((PASS + 1))
  else
    echo "  FAIL reject low bid: $body"
    FAIL=$((FAIL + 1))
  fi
fi

# Drying reservation
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [[ -z "$LISTING_ID" ]]; then
  echo "  FAIL no OPERATING drying listing"
  FAIL=$((FAIL + 1))
else
  START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  body=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  assert_json_ok "drying reserve" "$body"
fi

# Logout
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/auth/logout")
assert_status "user logout" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
