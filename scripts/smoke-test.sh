#!/usr/bin/env bash
# API smoke tests — must run against `npm run dev` (not production build).
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_DIR=$(mktemp -d)
trap 'rm -rf "$COOKIE_DIR"' EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual) $body"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests against $BASE ==="

# 1. Homepage
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "Homepage" "200" "$CODE"

# 2. Admin login bad creds
BODY=$(curl -s -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"00000000000","password":"wrong"}')
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"00000000000","password":"wrong"}')
assert_status "Admin login (bad creds)" "401" "$CODE"

# 3. Admin login good
BODY=$(curl -s -c "$COOKIE_DIR/admin.txt" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "Admin login" "$BODY"

# 4. User login
BODY=$(curl -s -c "$COOKIE_DIR/user.txt" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "User login" "$BODY"

# 5. Upload without multipart → 400
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -b "$COOKIE_DIR/admin.txt" -d '{}')
assert_status "Upload non-multipart" "400" "$CODE"

# 6. Asset create without multipart → 400
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -b "$COOKIE_DIR/admin.txt" -d '{}')
assert_status "Asset create non-multipart" "400" "$CODE"

# 7. Dev third-party token
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke")
assert_status "Dev third-party token" "200" "$CODE"

# 8. Third-party auth
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_user" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
BODY=$(curl -s -c "$COOKIE_DIR/sso.txt" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
assert_json_ok "Third-party SSO login" "$BODY"

# 9. Register new user
PHONE="199$(date +%s | tail -c 9)"
BODY=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
assert_json_ok "User register" "$BODY"

# 10. Unauthenticated bid → 401
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
assert_status "Bid without login" "401" "$CODE"

# 11. Auction bid (dynamic min from DB)
BID_INFO=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({
    where: { status: 'LIVE' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!proj) { console.log('NONE'); await p.\$disconnect(); return; }
  const top = proj.bids[0] ? Number(proj.bids[0].amount) : 0;
  const min = top > 0 ? top + Number(proj.bidStep) : Number(proj.startPrice);
  console.log(proj.id + ' ' + min);
  await p.\$disconnect();
})();
" 2>/dev/null)
if [ "$BID_INFO" = "NONE" ] || [ -z "$BID_INFO" ]; then
  echo "  ✗ Auction bid (no LIVE project found)"
  FAIL=$((FAIL + 1))
else
  PID=$(echo "$BID_INFO" | awk '{print $1}')
  AMOUNT=$(echo "$BID_INFO" | awk '{print $2}')
  BODY=$(curl -s -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" -b "$COOKIE_DIR/user.txt" \
    -d "{\"amount\": $AMOUNT}")
  assert_json_ok "Auction bid (\$$AMOUNT)" "$BODY"
fi

# 12. Drying reserve
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  if (l) console.log(l.id);
  await p.\$disconnect();
})();
" 2>/dev/null)
START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
END=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
if [ -z "$LISTING_ID" ]; then
  echo "  ✗ Drying reserve (no OPERATING listing)"
  FAIL=$((FAIL + 1))
else
  BODY=$(curl -s -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" -b "$COOKIE_DIR/user.txt" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  assert_json_ok "Drying reserve" "$BODY"
fi

# 13. Admin pages (SSR)
for PAGE in /admin/login /m /m/auction /m/drying; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$PAGE")
  assert_status "Page $PAGE" "200" "$CODE"
done

# 14. Upload unauthenticated → 401
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: multipart/form-data" -F "file=@/dev/null")
assert_status "Upload unauthenticated" "401" "$CODE"

# 15. Invalid bid amount
if [ -n "${PID:-}" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" -b "$COOKIE_DIR/user.txt" \
    -d '{"amount": -1}')
  assert_status "Bid invalid amount" "400" "$CODE"
else
  echo "  - Bid invalid amount (skipped, no LIVE project)"
fi

# 16. Drying reserve bad params
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -b "$COOKIE_DIR/user.txt" \
  -d '{}')
assert_status "Drying reserve bad params" "400" "$CODE"

# 17. Admin logout
BODY=$(curl -s -X POST "$BASE/api/auth/admin/logout" -b "$COOKIE_DIR/admin.txt")
assert_json_ok "Admin logout" "$BODY"

# 18. User logout
BODY=$(curl -s -X POST "$BASE/api/auth/logout" -b "$COOKIE_DIR/user.txt")
assert_json_ok "User logout" "$BODY"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
