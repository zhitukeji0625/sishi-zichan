#!/bin/bash
# Integration test script for sishi-zichan
set -euo pipefail
BASE="http://localhost:3000"
COOKIE_JAR="/tmp/sishi-test-cookies.txt"
ADMIN_JAR="/tmp/sishi-admin-cookies.txt"
ERRORS=0

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; ERRORS=$((ERRORS+1)); }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

check_body() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -q "$pattern"; then pass "$name"; else fail "$name (body: $body)"; fi
}

echo "=== Page Tests ==="
for path in "/" "/admin/login" "/m" "/m/login" "/m/auction" "/m/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

echo ""
echo "=== Admin Login ==="
rm -f "$ADMIN_JAR"
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
check_status "POST /api/auth/admin/login" "200" "$code"
check_body "Admin login ok" '"ok":true' "$body"

echo ""
echo "=== Admin Protected Pages ==="
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  check_status "GET $path (admin)" "200" "$code"
done

echo ""
echo "=== End User Login ==="
rm -f "$COOKIE_JAR"
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
check_status "POST /api/auth/login" "200" "$code"
check_body "User login ok" '"ok":true' "$body"

echo ""
echo "=== Third-party Token (dev) ==="
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-ext-001")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
check_status "GET /api/dev/third-party-token" "200" "$code"
check_body "Third-party token" '"token"' "$body"

echo ""
echo "=== Auction Bid (needs project ID from DB) ==="
PROJECT_ID=$(cd /workspace && node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' } });
console.log(proj?.id ?? '');
await p.\$disconnect();
" 2>/dev/null)

if [ -n "$PROJECT_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount": 15000}')
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -1)
  # 200 ok or 400 if bid too low - both are valid API responses
  if [ "$code" = "200" ]; then
    pass "POST /api/m/auction/$PROJECT_ID/bid ($code)"
    check_body "Bid response" '"ok":true' "$body"
  elif [ "$code" = "400" ]; then
    pass "POST /api/m/auction/$PROJECT_ID/bid ($code - business rule)"
  else
    fail "POST /api/m/auction/$PROJECT_ID/bid (expected 200/400, got $code: $body)"
  fi
else
  fail "No BIDDING auction project found in DB"
fi

echo ""
echo "=== Drying Reservation ==="
LISTING_ID=$(cd /workspace && node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
console.log(l?.id ?? '');
await p.\$disconnect();
" 2>/dev/null)

if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+5 days" +%Y-%m-%d 2>/dev/null || date -v+5d +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -1)
  if [ "$code" = "200" ]; then
    pass "POST /api/m/drying/reserve ($code)"
    check_body "Reserve response" '"ok":true' "$body"
  elif [ "$code" = "400" ]; then
    pass "POST /api/m/drying/reserve ($code - may conflict with existing)"
  else
    fail "POST /api/m/drying/reserve (expected 200/400, got $code: $body)"
  fi
else
  fail "No OPERATING drying listing found in DB"
fi

echo ""
echo "=== Mock Payment (auction deposit) ==="
if [ -n "$PROJECT_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/payments/mock" \
    -H "Content-Type: application/json" \
    -d "{\"purpose\":\"AUCTION_DEPOSIT\",\"auctionProjectId\":\"$PROJECT_ID\"}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -1)
  if [ "$code" = "200" ]; then
    pass "POST /api/m/payments/mock AUCTION_DEPOSIT ($code)"
  elif [ "$code" = "409" ]; then
    pass "POST /api/m/payments/mock AUCTION_DEPOSIT ($code - already paid)"
  else
    fail "POST /api/m/payments/mock (expected 200/409, got $code: $body)"
  fi
fi

echo ""
echo "=== Auth Guards ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
check_status "Unauthenticated bid" "401" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
# Without cookie should redirect to login (307) or 401
if [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "401" ]; then
  pass "Unauthenticated admin redirect ($code)"
else
  fail "Unauthenticated admin (expected redirect, got $code)"
fi

echo ""
echo "=== Invalid Login ==="
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
code=$(echo "$resp" | tail -1)
check_status "Wrong password" "401" "$code"

echo ""
echo "=== Summary ==="
if [ "$ERRORS" -eq 0 ]; then
  echo "All tests passed!"
  exit 0
else
  echo "$ERRORS test(s) failed."
  exit 1
fi
