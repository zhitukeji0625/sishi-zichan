#!/usr/bin/env bash
# API smoke tests — must run against `npm run dev` (not production build).
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ADMIN_COOKIE=/tmp/smoke_admin_cookies.txt
USER_COOKIE=/tmp/smoke_user_cookies.txt
rm -f "$ADMIN_COOKIE" "$USER_COOKIE"

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name (expected HTTP $expected, got $actual) $body"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name — $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests @ $BASE ==="

# --- Public pages ---
for path in "/" "/m" "/admin/login" "/m/auction" "/m/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

# --- Admin login ---
admin_body=$(curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "admin login" "$admin_body"

# --- User login ---
user_body=$(curl -s -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "user login" "$user_body"

# --- Register (dynamic phone) ---
reg_phone="199$(date +%s | tail -c 9)"
reg_body=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$reg_phone\",\"password\":\"test1234\",\"name\":\"冒烟用户\"}")
assert_json_ok "user register ($reg_phone)" "$reg_body"

# --- Non-multipart upload / assets (should 400, not 500) ---
upload_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"test":1}')
assert_status "upload rejects non-multipart" "400" "$upload_code"

assets_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"test"}')
assert_status "admin assets rejects non-multipart" "400" "$assets_code"

# --- Unauthenticated bid ---
bid_unauth=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
assert_status "bid requires auth" "401" "$bid_unauth"

# --- Dynamic LIVE project bid ---
read -r PROJECT_ID MIN_BID <<<"$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({
    where: { status: 'LIVE', endsAt: { gt: new Date() } },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!proj) { process.stdout.write('NONE 0'); await p.\$disconnect(); return; }
  const top = proj.bids[0]?.amount ?? proj.startPrice;
  const min = Number(top) + Number(proj.bidStep);
  process.stdout.write(proj.id + ' ' + min);
  await p.\$disconnect();
})();
" 2>/dev/null)"

if [ "$PROJECT_ID" = "NONE" ] || [ -z "$PROJECT_ID" ]; then
  echo "  FAIL: no LIVE auction project in DB (run npm run db:seed)"
  FAIL=$((FAIL + 1))
else
  bid_body=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  assert_json_ok "place bid ($MIN_BID on $PROJECT_ID)" "$bid_body"
fi

# --- Drying reservation ---
read -r LISTING_ID <<<"$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  process.stdout.write(l?.id ?? 'NONE');
  await p.\$disconnect();
})();
" 2>/dev/null)"

START_DATE=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
END_DATE=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)

if [ "$LISTING_ID" = "NONE" ] || [ -z "$LISTING_ID" ]; then
  echo "  FAIL: no OPERATING drying listing in DB"
  FAIL=$((FAIL + 1))
else
  dry_body=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  assert_json_ok "drying reserve ($START_DATE..$END_DATE)" "$dry_body"
fi

# --- Third-party dev token ---
tp_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke-test")
assert_status "dev third-party token" "200" "$tp_code"

# --- Logout ---
logout_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/auth/logout")
assert_status "user logout" "200" "$logout_code"

admin_logout=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/logout")
assert_status "admin logout" "200" "$admin_logout"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
