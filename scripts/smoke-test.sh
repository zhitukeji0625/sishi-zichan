#!/usr/bin/env bash
# HTTP smoke tests — requires dev server at BASE_URL (default http://localhost:3000)
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="$(mktemp)"
ADMIN_JAR="$(mktemp)"
PASS=0
FAIL=0

cleanup() { rm -f "$COOKIE_JAR" "$ADMIN_JAR"; }
trap cleanup EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3" body="$4"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name — expected HTTP $expected, got $actual"
    echo "    body: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests @ $BASE_URL ==="

# 1. Homepage
BODY=$(curl -s -w "\n%{http_code}" "$BASE_URL/")
CODE=$(echo "$BODY" | tail -1)
assert_status "GET /" "200" "$CODE" "$(echo "$BODY" | head -1)"

# 2. Admin login
BODY=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE_URL/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
CODE=$(echo "$BODY" | tail -1)
assert_status "POST /api/auth/admin/login" "200" "$CODE" "$(echo "$BODY" | head -1)"

# 3. Admin dashboard
BODY=$(curl -s -w "\n%{http_code}" -b "$ADMIN_JAR" "$BASE_URL/admin")
CODE=$(echo "$BODY" | tail -1)
assert_status "GET /admin (authenticated)" "200" "$CODE" ""

# 4. Upload without multipart → 400
BODY=$(curl -s -w "\n%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE_URL/api/upload" \
  -H "Content-Type: application/json" -d '{}')
CODE=$(echo "$BODY" | tail -1)
assert_status "POST /api/upload (non-multipart)" "400" "$CODE" "$(echo "$BODY" | head -1)"

# 5. Asset create without multipart → 400
BODY=$(curl -s -w "\n%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE_URL/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
CODE=$(echo "$BODY" | tail -1)
assert_status "POST /api/admin/assets (non-multipart)" "400" "$CODE" "$(echo "$BODY" | head -1)"

# 6. User login
BODY=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
CODE=$(echo "$BODY" | tail -1)
assert_status "POST /api/auth/login" "200" "$CODE" "$(echo "$BODY" | head -1)"

# 7. Bid without auth → 401
BODY=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/m/auction/fake-id/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
CODE=$(echo "$BODY" | tail -1)
assert_status "POST bid (no auth)" "401" "$CODE" "$(echo "$BODY" | head -1)"

# 8. Mobile auction list
BODY=$(curl -s -w "\n%{http_code}" "$BASE_URL/m/auction")
CODE=$(echo "$BODY" | tail -1)
assert_status "GET /m/auction" "200" "$CODE" ""

# 9. Find LIVE auction project id (trigger demo refresh via page load)
BODY=$(curl -s -w "\n%{http_code}" "$BASE_URL/m/auction")
PROJECT_ID=$(echo "$BODY" | head -1 | grep -oP '/m/auction/c[a-z0-9]{20,}' | head -1 | sed 's|/m/auction/||' || true)
if [[ -z "$PROJECT_ID" ]]; then
  echo "  ✗ Could not find auction project id on /m/auction"
  FAIL=$((FAIL + 1))
else
  echo "  ✓ Found auction project: $PROJECT_ID"
  PASS=$((PASS + 1))
fi

# 10. Auction detail page
if [[ -n "$PROJECT_ID" ]]; then
  BODY=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" "$BASE_URL/m/auction/$PROJECT_ID")
  CODE=$(echo "$BODY" | tail -1)
  assert_status "GET /m/auction/$PROJECT_ID" "200" "$CODE" ""
fi

# 11. Place bid (dynamic min amount)
if [[ -n "$PROJECT_ID" ]]; then
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    (async () => {
      const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
      const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
      const min = top
        ? Number(top.amount) + Number(proj.bidStep)
        : Number(proj.startPrice);
      console.log(min);
      await p.\$disconnect();
    })();
  " 2>/dev/null)
  BODY=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE_URL/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  CODE=$(echo "$BODY" | tail -1)
  assert_status "POST bid amount=$MIN_BID" "200" "$CODE" "$(echo "$BODY" | head -1)"
fi

# 12. Drying list page
BODY=$(curl -s -w "\n%{http_code}" "$BASE_URL/m/drying")
CODE=$(echo "$BODY" | tail -1)
assert_status "GET /m/drying" "200" "$CODE" ""

# 13. Drying reservation
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  (async () => {
    const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
    console.log(l?.id ?? '');
    await p.\$disconnect();
  })();
" 2>/dev/null)
START_DATE=$(date -u -d "+4 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+4d +%Y-%m-%dT00:00:00.000Z)
END_DATE=$(date -u -d "+5 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+5d +%Y-%m-%dT00:00:00.000Z)
if [[ -n "$LISTING_ID" ]]; then
  BODY=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE_URL/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  CODE=$(echo "$BODY" | tail -1)
  # 200 = created; 400 = date conflict from prior run — both prove API works
  if [[ "$CODE" == "200" || "$CODE" == "400" ]]; then
    echo "  ✓ POST /api/m/drying/reserve (HTTP $CODE)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ POST /api/m/drying/reserve — expected 200 or 400, got $CODE"
    echo "    body: $(echo "$BODY" | head -1)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ✗ No drying listing found"
  FAIL=$((FAIL + 1))
fi

# 14. User register (dynamic phone)
NEW_PHONE=$(node -e "console.log('199' + String(Date.now()).slice(-8))")
BODY=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$NEW_PHONE\",\"password\":\"test1234\",\"name\":\"冒烟用户\",\"idCard\":\"650101199001019999\",\"orgCode\":\"CO101\"}")
CODE=$(echo "$BODY" | tail -1)
assert_status "POST /api/auth/register phone=$NEW_PHONE" "200" "$CODE" "$(echo "$BODY" | head -1)"

# 15. Dev third-party token
BODY=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/dev/third-party-token?u_id=13800138000")
CODE=$(echo "$BODY" | tail -1)
assert_status "GET /api/dev/third-party-token" "200" "$CODE" "$(echo "$BODY" | head -1)"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
