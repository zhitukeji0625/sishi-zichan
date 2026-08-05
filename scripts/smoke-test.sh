#!/bin/bash
# API smoke tests — run against a live server (default http://localhost:3000)
set -e
BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/smoke-cookies.txt"
USER_JAR="/tmp/smoke-user-cookies.txt"
rm -f "$COOKIE_JAR" "$USER_JAR"

check() {
  local name="$1" expected="$2" actual="$3" body="$4"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    echo "  body: $body"
    FAIL=$((FAIL+1))
  fi
}

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "GET /" "200" "$code" ""

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check "GET /admin/login" "200" "$code" ""

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
check "GET /m" "200" "$code" ""

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"bad","password":"bad"}')
code=$(echo "$resp" | tail -1)
check "POST admin login bad creds" "401" "$code" "$(echo "$resp" | head -1)"

resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
check "POST admin login ok" "200" "$code" "$(echo "$resp" | head -1)"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/admin")
check "GET /admin (authenticated)" "200" "$code" ""

resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')
code=$(echo "$resp" | tail -1)
check "POST /api/upload non-multipart" "400" "$code" "$(echo "$resp" | head -1)"

resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{}')
code=$(echo "$resp" | tail -1)
check "POST /api/admin/assets non-multipart" "400" "$code" "$(echo "$resp" | head -1)"

resp=$(curl -s -w "\n%{http_code}" -c "$USER_JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
check "POST user login ok" "200" "$code" "$(echo "$resp" | head -1)"

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" -H "Content-Type: application/json" -d '{"amount":100}')
code=$(echo "$resp" | tail -1)
check "POST bid no auth" "401" "$code" "$(echo "$resp" | head -1)"

resp=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/auction/fake/bid" -H "Content-Type: application/json" -d '{"amount":-1}')
code=$(echo "$resp" | tail -1)
check "POST bid invalid amount" "400" "$code" "$(echo "$resp" | head -1)"

resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test")
code=$(echo "$resp" | tail -1)
check "GET dev third-party-token (prod)" "404" "$code" "$(echo "$resp" | head -1)"

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d '{}')
code=$(echo "$resp" | tail -1)
check "POST drying reserve no auth" "401" "$code" "$(echo "$resp" | head -1)"

resp=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d '{}')
code=$(echo "$resp" | tail -1)
check "POST drying reserve invalid params" "400" "$code" "$(echo "$resp" | head -1)"

resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/payments/mock" -H "Content-Type: application/json" -d '{}')
code=$(echo "$resp" | tail -1)
check "POST mock payment no auth" "401" "$code" "$(echo "$resp" | head -1)"

# Bid on live auction (if seed data present)
AUCTION_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { prisma } from './src/lib/prisma';
prisma.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then(r => { console.log(r?.id ?? ''); })
  .finally(() => prisma.\$disconnect());
" 2>/dev/null)
if [ -n "$AUCTION_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" -H "Content-Type: application/json" -d '{"amount":8200}')
  code=$(echo "$resp" | tail -1)
  check "POST bid on live auction" "200" "$code" "$(echo "$resp" | head -1)"
else
  echo "⊘ POST bid on live auction (skipped: no LIVE auction)"
fi

# Drying duplicate reservation
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { prisma } from './src/lib/prisma';
prisma.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { console.log(r?.id ?? ''); })
  .finally(() => prisma.\$disconnect());
" 2>/dev/null)
if [ -n "$LISTING_ID" ]; then
  START=$(date -u -d "+3 days" +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
  END=$(date -u -d "+4 days" +%Y-%m-%d 2>/dev/null || date -u -v+4d +%Y-%m-%d)
  PAYLOAD="{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}"
  resp=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d "$PAYLOAD")
  code=$(echo "$resp" | tail -1)
  first_code="$code"
  resp2=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d "$PAYLOAD")
  code2=$(echo "$resp2" | tail -1)
  if [ "$first_code" = "200" ] || [ "$first_code" = "409" ]; then
    check "POST drying reserve duplicate" "409" "$code2" "$(echo "$resp2" | head -1)"
  else
    check "POST drying reserve first" "200" "$first_code" "$(echo "$resp" | head -1)"
  fi
else
  echo "⊘ POST drying reserve duplicate (skipped: no OPERATING listing)"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
exit $FAIL
