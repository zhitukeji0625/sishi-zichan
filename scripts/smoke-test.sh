#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "✓ $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name — expected HTTP $expected, got $actual"
    FAIL=$((FAIL + 1))
  fi
}

check_json() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -qE "$pattern"; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name — body: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke Test: $BASE ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Homepage" "200" "$code"

# 2. Favicon
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/favicon.svg")
check "Favicon" "200" "$code"

# 3. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check "Admin login page" "200" "$code"

# 4. Admin area redirect (unauthenticated)
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
if [[ "$code" == "307" || "$code" == "302" ]]; then
  echo "✓ Admin redirect when unauthenticated (HTTP $code)"
  PASS=$((PASS + 1))
else
  echo "✗ Admin redirect — expected 307/302, got $code"
  FAIL=$((FAIL + 1))
fi

# 5. Mobile H5
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
check "Mobile H5" "200" "$code"

# 6. Admin login API
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' \
  -c "$COOKIE_JAR")
code=$(echo "$body" | tail -1)
resp=$(echo "$body" | sed '$d')
check "Admin login API" "200" "$code"
check_json "Admin login response" '"ok":true' "$resp"

# 7. User login API
USER_JAR=$(mktemp)
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' \
  -c "$USER_JAR")
code=$(echo "$body" | tail -1)
resp=$(echo "$body" | sed '$d')
check "User login API" "200" "$code"
check_json "User login response" '"ok":true' "$resp"

# 8. Third-party token (dev only)
body=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test_user")
code=$(echo "$body" | tail -1)
resp=$(echo "$body" | sed '$d')
check "Third-party token API" "200" "$code"
TOKEN=$(echo "$resp" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -n "$TOKEN" ]]; then
  echo "✓ Third-party token returned"
  PASS=$((PASS + 1))
else
  echo "✗ Third-party token missing"
  FAIL=$((FAIL + 1))
fi

# 9. Third-party login
if [[ -n "$TOKEN" ]]; then
  body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  code=$(echo "$body" | tail -1)
  resp=$(echo "$body" | sed '$d')
  check "Third-party login API" "200" "$code"
  check_json "Third-party login response" '"ok":true' "$resp"
fi

# 10. Upload without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
check "Upload without auth" "401" "$code"

# 11. Upload with admin cookie but no multipart
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -d '{}')
# Should be 400 (missing file) or 500 if formData fails - we want 400
if [[ "$code" == "400" ]]; then
  echo "✓ Upload non-multipart returns 400 (HTTP $code)"
  PASS=$((PASS + 1))
else
  echo "✗ Upload non-multipart — expected 400, got $code"
  FAIL=$((FAIL + 1))
fi

# 12. Asset create without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets")
check "Asset create without auth" "401" "$code"

# 13. Asset create with admin cookie but no multipart
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -d '{}')
if [[ "$code" == "400" ]]; then
  echo "✓ Asset create non-multipart returns 400 (HTTP $code)"
  PASS=$((PASS + 1))
else
  echo "✗ Asset create non-multipart — expected 400, got $code"
  FAIL=$((FAIL + 1))
fi

# 14. Auction bid (need project ID)
PROJECT_ID=""
PID=""
BID=""
PROJECT_ID=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true, startPrice: true, bidStep: true } });
  if (!proj) return;
  const top = await p.auctionBid.findFirst({ where: { projectId: proj.id }, orderBy: { amount: 'desc' }, select: { amount: true } });
  const cur = top ? Number(top.amount) : Number(proj.startPrice);
  console.log(proj.id + ' ' + (cur + Number(proj.bidStep)));
}
main().finally(() => p.\$disconnect());
" 2>/dev/null | tail -1) || true

if [[ -n "$PROJECT_ID" ]]; then
  PID=$(echo "$PROJECT_ID" | awk '{print $1}')
  BID=$(echo "$PROJECT_ID" | awk '{print $2}')
  body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/$PID/bid" \
    -b "$USER_JAR" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$BID}")
  code=$(echo "$body" | tail -1)
  resp=$(echo "$body" | sed '$d')
  check "Auction bid API" "200" "$code"
  check_json "Auction bid response" '"ok":true' "$resp"
else
  echo "✗ No LIVE auction project found"
  FAIL=$((FAIL + 1))
fi

# 15. Drying reservation
LISTING_ID=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { if (r) console.log(r.id); })
  .finally(() => p.\$disconnect());
" 2>/dev/null | tail -1) || true

if [[ -n "$LISTING_ID" ]]; then
  START=$(date -u -d "+3 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+3d +%Y-%m-%dT00:00:00.000Z)
  END=$(date -u -d "+4 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+4d +%Y-%m-%dT00:00:00.000Z)
  body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -b "$USER_JAR" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$body" | tail -1)
  resp=$(echo "$body" | sed '$d')
  check "Drying reservation API" "200" "$code"
  check_json "Drying reservation response" '"ok":true' "$resp"
else
  echo "✗ No OPERATING drying listing found"
  FAIL=$((FAIL + 1))
fi

# 16. Mock payment (auction deposit - already paid, expect 409)
if [[ -n "$PID" ]]; then
  body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/payments/mock" \
    -b "$USER_JAR" \
    -H "Content-Type: application/json" \
    -d "{\"purpose\":\"AUCTION_DEPOSIT\",\"auctionProjectId\":\"$PID\"}")
  code=$(echo "$body" | tail -1)
  # 409 = already paid (expected for seeded data)
  if [[ "$code" == "409" || "$code" == "200" ]]; then
    echo "✓ Mock payment API responds (HTTP $code)"
    PASS=$((PASS + 1))
  else
    echo "✗ Mock payment — expected 409 or 200, got $code"
    FAIL=$((FAIL + 1))
  fi
fi

# 17. Register validation
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{}')
check "Register validation" "400" "$code"

rm -f "$USER_JAR"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
