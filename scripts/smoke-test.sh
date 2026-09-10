#!/usr/bin/env bash
# API smoke tests — must run against dev server on localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    [ -n "$body" ] && echo "  body: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests against $BASE ==="

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Homepage" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check "Admin login page" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
check "Mobile home" "200" "$code"

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
check "Admin login API" "200" "$code" "$body"

ADMIN_COOKIE=$(curl -s -c - -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' \
  | grep sishi_admin_session | awk '{print $NF}')

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
check "User login API" "200" "$code" "$body"

USER_COOKIE=$(curl -s -c - -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' \
  | grep sishi_user_session | awk '{print $NF}')

resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=testuser")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
check "Third-party token" "200" "$code" "$body"

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/upload")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
check "Upload no auth" "401" "$code" "$body"

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/upload" \
  -H "Cookie: sishi_admin_session=$ADMIN_COOKIE" \
  -H "Content-Type: application/json" -d '{}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
check "Upload non-multipart" "400" "$code" "$body"

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/admin/assets")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
check "Admin assets no auth" "401" "$code" "$body"

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Cookie: sishi_admin_session=$ADMIN_COOKIE" \
  -H "Content-Type: application/json" -d '{}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
check "Admin assets non-multipart" "400" "$code" "$body"

# Trigger layout refresh (demo auction renewal)
curl -s -o /dev/null "$BASE/m/auction"

html=$(curl -s "$BASE/m/auction")
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")
check "Auction list page" "200" "$code"
PROJECT_ID=$(echo "$html" | grep -oP 'c[a-z0-9]{20,}' | head -1)

if [ -n "$PROJECT_ID" ]; then
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
    (async () => {
      const { PrismaClient } = await import('@prisma/client');
      const { Decimal } = await import('@prisma/client/runtime/library');
      const p = new PrismaClient();
      const project = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
      if (!project) { console.log('8200'); return; }
      const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
      const min = top
        ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
        : new Decimal(project.startPrice.toString());
      console.log(min.toFixed(0));
      await p.\$disconnect();
    })();
  ")
  resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Cookie: sishi_user_session=$USER_COOKIE" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -1)
  check "Auction bid" "200" "$code" "$body"
else
  echo "✗ Auction bid (no project ID on page)"
  FAIL=$((FAIL + 1))
fi

html=$(curl -s "$BASE/m/drying")
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying")
check "Drying list page" "200" "$code"
LISTING_ID=$(echo "$html" | grep -oP 'c[a-z0-9]{20,}' | head -1)

if [ -n "$LISTING_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H "Cookie: sishi_user_session=$USER_COOKIE" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-03\"}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -1)
  if [ "$code" = "200" ] || [ "$code" = "400" ]; then
    echo "✓ Drying reserve ($code)"
    PASS=$((PASS + 1))
  else
    echo "✗ Drying reserve (expected 200/400, got $code) body: $body"
    FAIL=$((FAIL + 1))
  fi
else
  echo "✗ Drying reserve (no listing ID on page)"
  FAIL=$((FAIL + 1))
fi

PHONE="199$(date +%s | tail -c 9)"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"测试用户\"}")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
check "User register" "200" "$code" "$body"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
