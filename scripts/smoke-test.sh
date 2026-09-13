#!/usr/bin/env bash
# API smoke tests — must run against a live dev server (npm run dev)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$USER_JAR"' EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expected, got $actual) body=$body"
    FAIL=$((FAIL + 1))
  fi
}

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "homepage" "200" "$code"

# 2. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "admin login page" "200" "$code"

# 3. Mobile login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")
assert_status "mobile login page" "200" "$code"

# 4. Admin login - wrong password
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"wrong"}')
code=$(echo "$resp" | tail -1)
assert_status "admin login wrong password" "401" "$code"

# 5. Admin login - success
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
assert_status "admin login success" "200" "$code" "$body"

# 6. User login - success
resp=$(curl -s -w "\n%{http_code}" -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
assert_status "user login success" "200" "$code"

# 7. User login - wrong password
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
code=$(echo "$resp" | tail -1)
assert_status "user login wrong password" "401" "$code"

# 8. Protected API without auth
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/test/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
code=$(echo "$resp" | tail -1)
assert_status "bid without auth" "401" "$code"

# 9. Upload without auth
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/upload")
code=$(echo "$resp" | tail -1)
assert_status "upload without auth" "401" "$code"

# 10. Upload non-multipart (with admin auth)
resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"test":1}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
assert_status "upload non-multipart" "400" "$code" "$body"

# 11. Admin assets non-multipart
resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"test"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
assert_status "admin assets non-multipart" "400" "$code" "$body"

# 12. Register new user
PHONE="199$(date +%s | tail -c 9)"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"测试用户\"}")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
assert_status "user register" "200" "$code" "$body"

# 13. Register duplicate
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\"}")
code=$(echo "$resp" | tail -1)
assert_status "user register duplicate" "409" "$code"

# 14. Dev third-party token
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=demo")
code=$(echo "$resp" | tail -1)
assert_status "dev third-party token" "200" "$code"

# 15. Third-party auth
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=demo" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
code=$(echo "$resp" | tail -1)
assert_status "third-party auth" "200" "$code"

# 16. Drying reserve without auth
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"x","startDate":"2026-01-01","endDate":"2026-01-02"}')
code=$(echo "$resp" | tail -1)
assert_status "drying reserve without auth" "401" "$code"

# 17. Auction bid (dynamic min from DB)
LIVE_PROJECT=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({
    where: { status: 'LIVE' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!proj) { console.log(''); process.exit(0); }
  const top = proj.bids[0]?.amount ?? proj.startPrice;
  const min = Number(top) + Number(proj.bidStep);
  console.log(JSON.stringify({ id: proj.id, min }));
  await p.\$disconnect();
})();
" 2>/dev/null)

if [ -n "$LIVE_PROJECT" ]; then
  PROJ_ID=$(echo "$LIVE_PROJECT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  MIN_BID=$(echo "$LIVE_PROJECT" | python3 -c "import sys,json; print(json.load(sys.stdin)['min'])")
  resp=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJ_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  assert_status "auction bid" "200" "$code" "$body"
else
  echo "FAIL: auction bid (no LIVE project)"
  FAIL=$((FAIL + 1))
fi

# 18. Drying reserve with auth
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+10 days" +%Y-%m-%d)
  END=$(date -d "+11 days" +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  assert_status "drying reserve" "200" "$code" "$body"
else
  echo "FAIL: drying reserve (no OPERATING listing)"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit "$FAIL"
