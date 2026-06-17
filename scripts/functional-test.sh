#!/usr/bin/env bash
# Functional completeness test for sishi-zichan
set -euo pipefail
BASE="http://localhost:3000"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/sishi-test-cookies.txt"
ADMIN_JAR="/tmp/sishi-admin-cookies.txt"
rm -f "$COOKIE_JAR" "$ADMIN_JAR"

pass() { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1 — $2"; }

# --- Page tests ---
echo "=== Public pages ==="
for path in "/" "/m" "/m/login" "/m/register" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path → $code"; else fail "GET $path" "expected 200, got $code"; fi
done

# favicon
code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/favicon.ico")
if [ "$code" = "200" ]; then pass "GET /favicon.ico → $code"; else fail "GET /favicon.ico" "expected 200, got $code"; fi

# --- Auth: unauthenticated ---
echo "=== Auth guards ==="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
if [ "$code" = "307" ] || [ "$code" = "302" ]; then pass "GET /admin (no cookie) → redirect $code"; else fail "GET /admin" "expected redirect, got $code"; fi

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/m/auction/x/bid" -X POST -H "Content-Type: application/json" -d '{}')
if [ "$code" = "401" ]; then pass "POST /api/m/auction/x/bid (no cookie) → 401"; else fail "protected API" "expected 401, got $code"; fi

# --- Admin login ---
echo "=== Admin auth ==="
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
if [ "$code" = "200" ] && echo "$body" | grep -q '"ok":true'; then pass "Admin login"; else fail "Admin login" "code=$code body=$body"; fi

# Admin pages
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/announcements" \
  "/admin/organizations" "/admin/admins" "/admin/registrations" "/admin/audit" "/admin/config" "/admin/dict"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path (admin) → $code"; else fail "GET $path (admin)" "got $code"; fi
done

# Admin API: assets without formData
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{}')
if [ "$code" = "400" ]; then pass "POST /api/admin/assets (no formData) → 400"; else fail "admin assets no body" "expected 400, got $code"; fi

# --- User login ---
echo "=== User auth ==="
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
if [ "$code" = "200" ] && echo "$body" | grep -q '"ok":true'; then pass "User login"; else fail "User login" "code=$code body=$body"; fi

# User pages
for path in "/m/auction" "/m/drying" "/m/me" "/m/orders"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path (user) → $code"; else fail "GET $path (user)" "got $code"; fi
done

# --- Third party token ---
echo "=== Dev APIs ==="
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-ext-001")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
if [ "$code" = "200" ] && echo "$body" | grep -q 'token'; then pass "GET /api/dev/third-party-token → 200"; else fail "third-party-token" "code=$code"; fi

# --- Auction bid ---
echo "=== Auction ==="
# Get live project id from page or DB
PROJECT_ID=$(cd /workspace && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true, startPrice: true, bidStep: true } });
  if (proj) {
    const top = await p.auctionBid.findFirst({ where: { projectId: proj.id }, orderBy: { amount: 'desc' } });
    const min = top ? Number(top.amount) + Number(proj.bidStep) : Number(proj.startPrice);
    console.log(proj.id + '|' + min);
  }
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "" ]; then
  fail "Auction LIVE project" "no LIVE project found in DB"
else
  PID=$(echo "$PROJECT_ID" | cut -d'|' -f1)
  AMOUNT=$(echo "$PROJECT_ID" | cut -d'|' -f2)
  pass "Found LIVE project $PID min bid $AMOUNT"

  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/auction/$PID")
  if [ "$code" = "200" ]; then pass "GET /m/auction/$PID → 200"; else fail "auction detail" "got $code"; fi

  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$AMOUNT}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  if [ "$code" = "200" ] && echo "$body" | grep -q '"ok":true'; then pass "POST bid $AMOUNT → 200"; else fail "bid" "code=$code body=$body"; fi
fi

# --- Drying reserve ---
echo "=== Drying ==="
LISTING_ID=$(cd /workspace && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } });
  if (l) console.log(l.id);
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [ -z "$LISTING_ID" ]; then
  fail "Drying listing" "no OPERATING listing"
else
  pass "Found drying listing $LISTING_ID"
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/drying/$LISTING_ID")
  if [ "$code" = "200" ]; then pass "GET /m/drying/$LISTING_ID → 200"; else fail "drying detail" "got $code"; fi

  START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+5 days" +%Y-%m-%d 2>/dev/null || date -v+5d +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  if [ "$code" = "200" ] && echo "$body" | grep -q '"ok":true'; then pass "POST drying reserve → 200"; else fail "drying reserve" "code=$code body=$body"; fi
fi

# --- Bad login ---
echo "=== Error handling ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')
if [ "$code" = "401" ]; then pass "Bad user login → 401"; else fail "bad login" "got $code"; fi

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{}')
if [ "$code" = "400" ]; then pass "Empty login → 400"; else fail "empty login" "got $code"; fi

# --- Logout ---
resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
code=$(echo "$resp" | tail -1)
if [ "$code" = "200" ]; then pass "User logout → 200"; else fail "logout" "got $code"; fi

# --- Summary ---
echo ""
echo "=============================="
echo "Results: $PASS passed, $FAIL failed"
echo "=============================="
[ "$FAIL" -eq 0 ]
