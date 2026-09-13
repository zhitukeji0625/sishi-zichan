#!/usr/bin/env bash
# API smoke tests — requires dev server at BASE (default http://localhost:3000)
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
PASS=0
FAIL=0
ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$ADMIN_JAR" "$USER_JAR"' EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name (expected $expected, got $actual) $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests against $BASE ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "homepage" "200" "$code"

# 2. Mobile home
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
assert_status "mobile home" "200" "$code"

# 3. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "admin login page" "200" "$code"

# 4. Admin login wrong password
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"wrong"}')
assert_status "admin login wrong pwd" "401" "$code"

# 5. Admin login correct
resp=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
assert_status "admin login ok" "200" "$code"

# 6. Upload without multipart → 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H 'Content-Type: application/json' -d '{}')
assert_status "upload non-multipart" "400" "$code"

# 7. Assets without multipart → 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H 'Content-Type: application/json' -d '{}')
assert_status "assets non-multipart" "400" "$code"

# 8. User login
resp=$(curl -s -c "$USER_JAR" -b "$USER_JAR" -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
assert_status "user login ok" "200" "$code"

# 9. Bid without login → 401
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const a = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } });
  console.log(a?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)
if [[ -z "$PROJECT_ID" ]]; then
  echo "  FAIL: no LIVE auction in DB"
  FAIL=$((FAIL + 1))
else
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' -d '{"amount":8200}')
  assert_status "bid no auth" "401" "$code"

  # 10. Compute min bid and place bid
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
  const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
  const min = top ? Number(top.amount) + Number(proj!.bidStep) : Number(proj!.startPrice);
  console.log(min);
  await p.\$disconnect();
})();
" 2>/dev/null)
  resp=$(curl -s -b "$USER_JAR" -w "\n%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -1)
  assert_status "place bid" "200" "$code" "$body"
fi

# 11. Dev third-party token
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test_user")
assert_status "dev third-party token" "200" "$code"

# 12. Register new user
PHONE="199$(date +%s | tail -c 9)"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
assert_status "register" "200" "$code"

# 13. Drying reserve
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)
START=$(date -d '+3 days' +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
END=$(date -d '+4 days' +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
if [[ -n "$LISTING_ID" ]]; then
  resp=$(curl -s -b "$USER_JAR" -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -1)
  assert_status "drying reserve" "200" "$code" "$body"
else
  echo "  FAIL: no OPERATING drying listing"
  FAIL=$((FAIL + 1))
fi

# 14. Protected admin route without cookie
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
assert_status "admin protected redirect" "307" "$code"

# 15. User logout
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/auth/logout")
assert_status "user logout" "200" "$code"

# 16. Admin logout
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
assert_status "admin logout" "200" "$code"

# 17. Auction list page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")
assert_status "auction list page" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
