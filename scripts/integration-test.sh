#!/bin/bash
# Integration test script for sishi-zichan
set -e
BASE="http://localhost:3000"
FAIL=0
COOKIE_JAR="/tmp/sishi-test-cookies.txt"
ADMIN_JAR="/tmp/sishi-admin-cookies.txt"
rm -f "$COOKIE_JAR" "$ADMIN_JAR"

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; FAIL=$((FAIL+1)); }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

echo "=== Page routes ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/m/me" "/m/orders" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

echo ""
echo "=== User auth ==="
# User login
RESP=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check_status "POST /api/auth/login" "200" "$CODE"
echo "$BODY" | grep -q '"ok":true' && pass "login response ok" || fail "login response not ok: $BODY"

# Protected mobile page with cookie
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/me")
check_status "GET /m/me (authenticated)" "200" "$code"

echo ""
echo "=== Admin auth ==="
RESP=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check_status "POST /api/auth/admin/login" "200" "$CODE"
echo "$BODY" | grep -q '"ok":true' && pass "admin login ok" || fail "admin login: $BODY"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
check_status "GET /admin (authenticated)" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/assets")
check_status "GET /admin/assets" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/auctions")
check_status "GET /admin/auctions" "200" "$code"

echo ""
echo "=== Third-party token (dev) ==="
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-user-001")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check_status "GET /api/dev/third-party-token" "200" "$CODE"
TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
  pass "third-party token received"
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  CODE=$(echo "$RESP" | tail -1)
  check_status "POST /api/auth/third-party" "200" "$CODE"
else
  fail "no token in response: $BODY"
fi

echo ""
echo "=== Auction bid (needs active project) ==="
# Get auction list page to find project id from DB
PROJECT_ID=$(cd /workspace && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then(r => { console.log(r?.id || ''); p.\$disconnect(); })
  .catch(e => { console.error(e); process.exit(1); });
" 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  RESP=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount": 10000}')
  CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  # 200 or 400 (already highest bidder etc) are acceptable
  if [ "$CODE" = "200" ] || [ "$CODE" = "400" ]; then
    pass "POST /api/m/auction/$PROJECT_ID/bid ($CODE)"
  else
    fail "POST bid (got $CODE): $BODY"
  fi
else
  echo "⚠ No LIVE auction project, skipping bid test"
fi

echo ""
echo "=== Drying reserve ==="
LISTING_ID=$(cd /workspace && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { console.log(r?.id || ''); p.\$disconnect(); })
  .catch(e => { process.exit(1); });
" 2>/dev/null | tail -1)

if [ -n "$LISTING_ID" ]; then
  START=$(date -u +%Y-%m-%d)
  END=$(date -u -d "+3 days" +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
  RESP=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\": \"$LISTING_ID\", \"startDate\": \"$START\", \"endDate\": \"$END\"}")
  CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  if [ "$CODE" = "200" ] || [ "$CODE" = "400" ]; then
    pass "POST /api/m/drying/reserve ($CODE)"
  else
    fail "POST drying reserve (got $CODE): $BODY"
  fi
else
  echo "⚠ No OPERATING drying listing, skipping"
fi

echo ""
echo "=== Logout ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
check_status "POST /api/auth/logout" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
check_status "POST /api/auth/admin/logout" "200" "$code"

echo ""
echo "=== Unauthenticated protection ==="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
# Should redirect to login (307/302) or 401
if [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "401" ]; then
  pass "GET /admin unauthenticated ($code)"
else
  fail "GET /admin unauthenticated (expected redirect, got $code)"
fi

echo ""
if [ $FAIL -eq 0 ]; then
  echo "All integration tests passed!"
  exit 0
else
  echo "$FAIL test(s) failed"
  exit 1
fi
