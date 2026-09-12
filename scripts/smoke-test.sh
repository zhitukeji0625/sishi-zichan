#!/usr/bin/env bash
# API smoke tests — must run against `npm run dev` (not production build)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
PASS=0
FAIL=0

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name — expected HTTP $expected, got $actual"
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

echo "=== Smoke tests against $BASE ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "Homepage" "200" "$code"

# 2. Admin login — wrong password
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"wrong"}')
assert_status "Admin login wrong password" "401" "$code"

# 3. Admin login — success
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -c "$ADMIN_JAR" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$body" | tail -1)
resp=$(echo "$body" | head -n -1)
assert_status "Admin login success" "200" "$code"
assert_body_contains "Admin login returns ok" '"ok":true' "$resp"

# 4. User login — success
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_JAR" \
  -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$body" | tail -1)
resp=$(echo "$body" | head -n -1)
assert_status "User login success" "200" "$code"
assert_body_contains "User login returns ok" '"ok":true' "$resp"

# 5. Protected API without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
assert_status "Bid without auth" "401" "$code"

# 6. User register
PHONE="199$(date +%s | tail -c 9)"
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
code=$(echo "$body" | tail -1)
resp=$(echo "$body" | head -n -1)
assert_status "User register" "200" "$code"
assert_body_contains "Register returns ok" '"ok":true' "$resp"

# 7. Duplicate register
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\"}")
assert_status "Duplicate register" "409" "$code"

# 8. Upload without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
assert_status "Upload without auth" "401" "$code"

# 9. Upload non-multipart (should not 500)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -b "$ADMIN_JAR" -H "Content-Type: application/json" -d '{}')
assert_status "Upload non-multipart" "400" "$code"

# 10. Admin assets non-multipart (should not 500)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -b "$ADMIN_JAR" -H "Content-Type: application/json" -d '{}')
assert_status "Admin assets non-multipart" "400" "$code"

# 11. Dev third-party token
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test123")
assert_status "Dev third-party token" "200" "$code"

# 12. Find LIVE auction project and bid
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
  if (proj) { console.log(proj.id); }
  await p.\$disconnect();
})();
" 2>/dev/null || true)

if [[ -n "$PROJECT_ID" ]]; then
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } });
  if (!proj) { process.exit(1); }
  const top = proj.bids[0]?.amount ?? proj.startPrice;
  const min = Number(top) + Number(proj.bidStep);
  console.log(min);
  await p.\$disconnect();
})();
" 2>/dev/null || echo "0")

  body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -b "$COOKIE_JAR" -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  code=$(echo "$body" | tail -1)
  assert_status "Place bid on LIVE project" "200" "$code"
else
  echo "  ⚠ No LIVE auction project — skipping bid test"
fi

# 13. Drying reservation
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  if (l) { console.log(l.id); }
  await p.\$disconnect();
})();
" 2>/dev/null || true)

if [[ -n "$LISTING_ID" ]]; then
  START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -b "$COOKIE_JAR" -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$body" | tail -1)
  resp=$(echo "$body" | head -n -1)
  assert_status "Drying reservation" "200" "$code"
  assert_body_contains "Drying reservation returns ok" '"ok":true' "$resp"
else
  echo "  ⚠ No OPERATING drying listing — skipping reserve test"
fi

# 14. Admin pages redirect without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -L --max-redirs 0 "$BASE/admin" 2>/dev/null || \
  curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
# Without cookie should redirect (302) or show login
code_no_cookie=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
if [[ "$code_no_cookie" == "307" || "$code_no_cookie" == "302" ]]; then
  echo "  ✓ Admin redirect without auth (HTTP $code_no_cookie)"
  PASS=$((PASS + 1))
else
  echo "  ✗ Admin redirect without auth — expected 302/307, got $code_no_cookie"
  FAIL=$((FAIL + 1))
fi

# 15. Mobile pages load
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
assert_status "Mobile home" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")
assert_status "Mobile login page" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")
assert_status "Mobile auction page" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying")
assert_status "Mobile drying page" "200" "$code"

# 16. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "Admin login page" "200" "$code"

# 17. Logout
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/logout" -b "$COOKIE_JAR")
assert_status "User logout" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/logout" -b "$ADMIN_JAR")
assert_status "Admin logout" "200" "$code"

# 18. Invalid login params
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{}')
assert_status "Login missing params" "400" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
rm -f "$COOKIE_JAR" "$ADMIN_JAR"
[[ "$FAIL" -eq 0 ]]
