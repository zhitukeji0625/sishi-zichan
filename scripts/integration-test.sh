#!/bin/bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $name (expected HTTP $expected, got $actual)"
    FAIL=1
  else
    echo "OK: $name"
  fi
}

check_json() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -q "$pattern"; then
    echo "OK: $name"
  else
    echo "FAIL: $name (body missing '$pattern')"
    echo "  body: $body"
    FAIL=1
  fi
}

echo "=== Integration tests against $BASE ==="

# Public pages
for path in "/" "/m" "/m/login" "/m/register" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# Admin login
ADMIN_BODY=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json "admin login" '"ok":true' "$ADMIN_BODY"

# Admin assets POST requires form body (GET returns 405 by design)
ASSETS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets")
check "POST /api/admin/assets without body" "400" "$ASSETS_CODE"

# User login
USER_BODY=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_json "user login" '"ok":true' "$USER_BODY"

# Third-party dev token
TP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-ext-001")
check "GET /api/dev/third-party-token" "200" "$TP_CODE"
TP_BODY=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-ext-001")
check_json "third-party token body" '"token"' "$TP_BODY"

# Get live auction project from DB via page scrape - use prisma in node
PROJECT_ID=$(cd /workspace && node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
console.log(proj?.id ?? '');
await p.\$disconnect();
" 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  MIN_BID=$(cd /workspace && node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
const p = new PrismaClient();
const project = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
const min = top
  ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
  : new Decimal(project.startPrice.toString());
console.log(min.toString());
await p.\$disconnect();
" 2>/dev/null | tail -1)
  BID_BODY=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  check_json "auction bid" '"ok":true' "$BID_BODY"
else
  echo "SKIP: no LIVE auction project"
fi

# Drying reserve
LISTING_ID=$(cd /workspace && node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const l = await p.dryingFieldListing.findFirst();
console.log(l?.id ?? '');
await p.\$disconnect();
" 2>/dev/null | tail -1)

if [ -n "$LISTING_ID" ]; then
  TOMORROW=$(date -u -d "+2 days" +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  RESERVE=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$TOMORROW\",\"endDate\":\"$TOMORROW\"}")
  check_json "drying reserve" '"ok":true\|"reservationId"' "$RESERVE"
fi

# Unauthorized bid
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
check "bid without login returns 401" "401" "$UNAUTH"

# Admin protected page without cookie
ADMIN_REDIRECT=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
# middleware may redirect 307 or return 200 for login page - check not 500
if [ "$ADMIN_REDIRECT" = "500" ]; then
  echo "FAIL: /admin/assets returned 500"
  FAIL=1
else
  echo "OK: /admin/assets without auth ($ADMIN_REDIRECT)"
fi

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

if [ "$FAIL" -eq 0 ]; then
  echo "=== All integration tests passed ==="
  exit 0
else
  echo "=== Some integration tests failed ==="
  exit 1
fi
