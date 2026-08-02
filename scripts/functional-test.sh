#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/ft-cookies.txt"
ADMIN_JAR="/tmp/ft-admin-cookies.txt"
rm -f "$COOKIE_JAR" "$ADMIN_JAR"

check() {
  local name="$1" code="$2" expect="$3"
  if [ "$code" = "$expect" ]; then
    echo "✓ $name ($code)"
    PASS=$((PASS+1))
  else
    echo "✗ $name (got $code, want $expect)"
    FAIL=$((FAIL+1))
  fi
}

echo "== Seeding database =="
npm run db:seed

echo ""
echo "== Page smoke tests =="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "$code" "200"
done

echo ""
echo "== User login =="
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$LOGIN" | grep -q '"ok":true'; then
  echo "✓ User login API"
  PASS=$((PASS+1))
else
  echo "✗ User login API: $LOGIN"
  FAIL=$((FAIL+1))
fi

echo ""
echo "== Admin login =="
ADMIN=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ADMIN" | grep -q '"ok":true'; then
  echo "✓ Admin login API"
  PASS=$((PASS+1))
else
  echo "✗ Admin login API: $ADMIN"
  FAIL=$((FAIL+1))
fi

echo ""
echo "== Third-party SSO =="
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-user-001" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || true)
if [ -n "$TOKEN" ]; then
  echo "✓ Third-party token"
  PASS=$((PASS+1))
  SSO_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
  check "GET /m/sso" "$SSO_CODE" "200"
else
  echo "✗ Third-party token"
  FAIL=$((FAIL+1))
fi

echo ""
echo "== API validation =="
UPLOAD_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" -b "$ADMIN_JAR")
check "POST /api/upload no multipart" "$UPLOAD_CODE" "400"

ASSET_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" -b "$ADMIN_JAR")
check "POST /api/admin/assets no multipart" "$ASSET_CODE" "400"

echo ""
echo "== Auction bid flow =="
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then(r => { console.log(r?.id ?? ''); return p.\$disconnect(); });
" 2>/dev/null)

if [ -n "$PROJECT_ID" ]; then
  echo "Found LIVE project: $PROJECT_ID"
  BID_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":99999}')
  echo "Bid response: $BID_RESP"
  if echo "$BID_RESP" | grep -qE '"ok":true|"error"'; then
    echo "✓ Bid API responds"
    PASS=$((PASS+1))
  else
    echo "✗ Bid API unexpected: $BID_RESP"
    FAIL=$((FAIL+1))
  fi
else
  echo "✗ No LIVE auction project found"
  FAIL=$((FAIL+1))
fi

echo ""
echo "== Drying reserve =="
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { console.log(r?.id ?? ''); return p.\$disconnect(); });
" 2>/dev/null)

if [ -n "$LISTING_ID" ]; then
  RESERVE_RESP=$(curl -s -b "$COOKIE_JAR" -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-09-01\",\"endDate\":\"2026-09-02\"}")
  HTTP_CODE=$(echo "$RESERVE_RESP" | tail -1)
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "409" ]; then
    echo "✓ Drying reserve API ($HTTP_CODE)"
    PASS=$((PASS+1))
  else
    echo "✗ Drying reserve API ($HTTP_CODE)"
    FAIL=$((FAIL+1))
  fi
else
  echo "✗ No operating drying listing found"
  FAIL=$((FAIL+1))
fi

echo ""
echo "== Static assets =="
ICON=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/icon.svg")
check "GET /icon.svg" "$ICON" "200"

FAV=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/favicon.ico")
check "GET /favicon.ico" "$FAV" "200"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
