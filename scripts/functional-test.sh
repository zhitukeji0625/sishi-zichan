#!/usr/bin/env bash
# API smoke tests — requires dev server at http://localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/ft-user-cookies.txt"
ADMIN_COOKIE_JAR="/tmp/ft-admin-cookies.txt"
rm -f "$COOKIE_JAR" "$ADMIN_COOKIE_JAR"

check() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual) $body"
    FAIL=$((FAIL + 1))
  fi
}

# 1–3. Pages
check "Portal" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "Admin login page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "H5 page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"

# 4. User login
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check "User login" "200" "$code" "$body"

# 5. Admin login
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check "Admin login" "200" "$code" "$body"

# 6. Auction bid
PROJECT_ID=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true, startPrice: true, bidStep: true } })
  .then(async (proj) => {
    if (!proj) { console.log(''); await p.\$disconnect(); return; }
    const top = await p.auctionBid.findFirst({ where: { projectId: proj.id }, orderBy: { amount: 'desc' } });
    const min = top ? Number(top.amount) + Number(proj.bidStep) : Number(proj.startPrice);
    console.log(proj.id + ' ' + min);
    await p.\$disconnect();
  });
" 2>/dev/null | tail -1)

if [ -z "$PROJECT_ID" ]; then
  echo "✗ Auction bid (no LIVE project found)"
  FAIL=$((FAIL + 1))
else
  PID=$(echo "$PROJECT_ID" | awk '{print $1}')
  AMOUNT=$(echo "$PROJECT_ID" | awk '{print $2}')
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/${PID}/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$AMOUNT}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  check "Auction bid" "200" "$code" "$body"
fi

# 7. Drying reserve
LISTING_ID=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(async (l) => { console.log(l?.id ?? ''); await p.\$disconnect(); });
" 2>/dev/null | tail -1)

if [ -z "$LISTING_ID" ]; then
  echo "✗ Drying reserve (no listing found)"
  FAIL=$((FAIL + 1))
else
  START=$(date -u +%Y-%m-%d)
  END=$(date -u -d "+2 days" +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  check "Drying reserve" "200" "$code" "$body"
fi

# 8. Upload rejects non-multipart
resp=$(curl -s -w "\n%{http_code}" -b "$ADMIN_COOKIE_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check "Upload rejects non-multipart" "400" "$code" "$body"

# 9. Admin assets rejects non-multipart
resp=$(curl -s -w "\n%{http_code}" -b "$ADMIN_COOKIE_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check "Admin assets rejects non-multipart" "400" "$code" "$body"

# 10. Dev third-party token
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test123")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check "Dev third-party token" "200" "$code" "$body"

# 11. Unauthenticated bid returns 401
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
code=$(echo "$resp" | tail -1)
check "Unauthenticated bid" "401" "$code"

echo ""
echo "Results: $PASS passed, $FAIL failed"
exit "$FAIL"
