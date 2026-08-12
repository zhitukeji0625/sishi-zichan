#!/usr/bin/env bash
# Functional API smoke tests for sishi-zichan
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
SKIP=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

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

skip_test() {
  echo "  ⊘ $1 (skipped: $2)"
  SKIP=$((SKIP + 1))
}

echo "=== Functional tests @ $BASE ==="

# 1. Portal
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "GET /" "200" "$code"

# 2. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "GET /admin/login" "200" "$code"

# 3. Mobile login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")
assert_status "GET /m/login" "200" "$code"

# 4. Unauthenticated /api/m/* returns 401
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" -H "Content-Type: application/json" -d '{"amount":100}')
code=$(echo "$body" | tail -1)
assert_status "POST /api/m/auction/bid without auth" "401" "$code"

# 5. User login
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/login" "200" "$code"

# 6. Admin login
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/admin/login" "200" "$code"

# 7. Invalid login
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/login wrong password" "401" "$code"

# 8. Third-party token (dev)
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=testuser")
code=$(echo "$resp" | tail -1)
assert_status "GET /api/dev/third-party-token" "200" "$code"
token=$(echo "$resp" | head -1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

# 9. Third-party auth
if [ -n "$token" ]; then
  resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" -d "{\"token\":\"$token\"}")
  code=$(echo "$resp" | tail -1)
  assert_status "POST /api/auth/third-party" "200" "$code"
else
  skip_test "POST /api/auth/third-party" "no token"
fi

# 10. Re-login user for tests
curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}' > /dev/null

# 11. Get LIVE auction project id from DB
PROJECT_ID=$(cd /workspace && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const live = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } });
  if (live) { console.log(live.id); }
  else {
    const any = await p.auctionProject.findFirst({ select: { id: true, status: true } });
    if (any) console.log(any.id + '|' + any.status);
  }
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

LISTING_ID=$(cd /workspace && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } });
  if (l) console.log(l.id);
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

PROJECT_STATUS=""
if echo "$PROJECT_ID" | grep -q '|'; then
  PROJECT_STATUS=$(echo "$PROJECT_ID" | cut -d'|' -f2)
  PROJECT_ID=$(echo "$PROJECT_ID" | cut -d'|' -f1)
fi

# 12. Bid on LIVE auction
if [ -n "$PROJECT_ID" ] && { [ -z "$PROJECT_STATUS" ] || [ "$PROJECT_STATUS" = "LIVE" ]; }; then
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":8200}')
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -1)
  assert_status "POST /api/m/auction/bid (LIVE)" "200" "$code" "$body"

  # 13. Reject bid below min increment
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":8250}')
  code=$(echo "$resp" | tail -1)
  assert_status "POST /api/m/auction/bid below min" "400" "$code"

  # 14. AUCTION_RENT blocked during LIVE
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/payments/mock" \
    -H "Content-Type: application/json" \
    -d "{\"purpose\":\"AUCTION_RENT\",\"auctionProjectId\":\"$PROJECT_ID\"}")
  code=$(echo "$resp" | tail -1)
  assert_status "POST /api/m/payments/mock AUCTION_RENT during LIVE" "400" "$code"
else
  skip_test "POST /api/m/auction/bid (LIVE)" "no LIVE auction (status=${PROJECT_STATUS:-none})"
  skip_test "POST /api/m/auction/bid below min" "no LIVE auction"
  skip_test "POST /api/m/payments/mock AUCTION_RENT during LIVE" "no LIVE auction"
fi

# 15. Bid on ENDED auction should fail
ENDED_ID=$(cd /workspace && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const e = await p.auctionProject.findFirst({ where: { status: 'ENDED' }, select: { id: true } });
  if (e) console.log(e.id);
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)
if [ -n "$ENDED_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$ENDED_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":10000}')
  code=$(echo "$resp" | tail -1)
  assert_status "POST /api/m/auction/bid on ENDED" "400" "$code"
else
  skip_test "POST /api/m/auction/bid on ENDED" "no ENDED auction"
fi

# 16. Drying reservation
if [ -n "$LISTING_ID" ]; then
  TOMORROW=$(date -u -d "+1 day" +%Y-%m-%d 2>/dev/null || date -u -v+1d +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$TOMORROW\",\"endDate\":\"$TOMORROW\"}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -1)
  assert_status "POST /api/m/drying/reserve" "200" "$code" "$body"

  # 17. maxAdvanceDays exceeded (30 days out)
  FAR=$(date -u -d "+30 days" +%Y-%m-%d 2>/dev/null || date -u -v+30d +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$FAR\",\"endDate\":\"$FAR\"}")
  code=$(echo "$resp" | tail -1)
  assert_status "POST /api/m/drying/reserve beyond maxAdvanceDays" "400" "$code"

  # 18. Invalid date range
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$TOMORROW\",\"endDate\":\"2020-01-01\"}")
  code=$(echo "$resp" | tail -1)
  assert_status "POST /api/m/drying/reserve end before start" "400" "$code"
else
  skip_test "POST /api/m/drying/reserve" "no listing"
  skip_test "POST /api/m/drying/reserve beyond maxAdvanceDays" "no listing"
  skip_test "POST /api/m/drying/reserve end before start" "no listing"
fi

# 19. User logout
resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/logout" "200" "$code"

# 20. Admin logout
resp=$(curl -s -w "\n%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/admin/logout" "200" "$code"

# 21. Register new user (11-digit phone)
RAND="1$(printf '%010d' $((RANDOM * 32768 + RANDOM)))"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$RAND\",\"password\":\"test1234\",\"name\":\"测试\"}")
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/register" "200" "$code"

# 22. Duplicate register
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$RAND\",\"password\":\"test1234\"}")
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/register duplicate" "409" "$code"

# 23. Mobile pages
for path in /m /m/auction /m/drying /m/me; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

# 24. Admin protected redirect
code=$(curl -s -o /dev/null -w "%{http_code}" -L --max-redirs 0 "$BASE/admin" 2>/dev/null || echo "302")
if [ "$code" = "302" ] || [ "$code" = "307" ]; then
  assert_status "GET /admin without auth redirects" "$code" "$code"
else
  # curl may follow redirect
  loc=$(curl -s -o /dev/null -w "%{redirect_url}" "$BASE/admin")
  if echo "$loc" | grep -q "login"; then
    echo "  ✓ GET /admin without auth redirects to login"
    PASS=$((PASS + 1))
  else
    echo "  ✗ GET /admin without auth (got $code, redirect=$loc)"
    FAIL=$((FAIL + 1))
  fi
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed, $SKIP skipped ==="
[ "$FAIL" -eq 0 ]
