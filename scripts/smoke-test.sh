#!/bin/bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $name (expected HTTP $expected, got $actual)"
    echo "  body: $body"
    FAIL=$((FAIL + 1))
  else
    echo "OK: $name"
  fi
}

db_query() {
  node --input-type=module -e "$1"
}

echo "=== Smoke test: $BASE ==="

for path in "/" "/m" "/m/login" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
echo "$TOKEN_RESP" | grep -q '"token"' || { echo "FAIL: third-party-token"; FAIL=$((FAIL+1)); }
echo "OK: GET /api/dev/third-party-token"

LOGIN=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
CODE=$(echo "$LOGIN" | tail -1)
BODY=$(echo "$LOGIN" | head -n -1)
check "POST /api/auth/login" "200" "$CODE" "$BODY"

ALOGIN=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
CODE=$(echo "$ALOGIN" | tail -1)
BODY=$(echo "$ALOGIN" | head -n -1)
check "POST /api/auth/admin/login" "200" "$CODE" "$BODY"

BID_UNAUTH=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":9000}')
CODE=$(echo "$BID_UNAUTH" | tail -1)
check "POST bid without auth" "401" "$CODE" ""

PROJECT_ID=$(db_query "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
console.log(proj?.id ?? '');
await p.\$disconnect();
")

if [ -n "$PROJECT_ID" ]; then
  BID=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":8200}')
  CODE=$(echo "$BID" | tail -1)
  BODY=$(echo "$BID" | head -n -1)
  if [ "$CODE" = "200" ] || [ "$CODE" = "400" ]; then
    echo "OK: POST /api/m/auction/$PROJECT_ID/bid ($CODE) $BODY"
  else
    echo "FAIL: bid returned $CODE $BODY"
    FAIL=$((FAIL+1))
  fi
else
  echo "WARN: no LIVE auction project (run npm run db:seed)"
fi

LISTING_ID=$(db_query "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
console.log(l?.id ?? '');
await p.\$disconnect();
")

if [ -n "$LISTING_ID" ]; then
  RESERVE=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-09-10\",\"endDate\":\"2026-09-12\"}")
  CODE=$(echo "$RESERVE" | tail -1)
  BODY=$(echo "$RESERVE" | head -n -1)
  if [ "$CODE" = "200" ] || [ "$CODE" = "400" ]; then
    echo "OK: POST /api/m/drying/reserve ($CODE)"
  else
    echo "FAIL: reserve returned $CODE $BODY"
    FAIL=$((FAIL+1))
  fi
fi

TP_TOKEN=$(echo "$TOKEN_RESP" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).token")
if [ -n "$TP_TOKEN" ]; then
  SSO=$(curl -s -w "\n%{http_code}" -c /tmp/sso.jar -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" -d "{\"token\":\"$TP_TOKEN\"}")
  CODE=$(echo "$SSO" | tail -1)
  check "POST /api/auth/third-party" "200" "$CODE" ""
fi

REG=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
CODE=$(echo "$REG" | tail -1)
check "POST register duplicate" "409" "$CODE" ""

rm -f "$COOKIE_JAR" "$ADMIN_JAR" /tmp/sso.jar 2>/dev/null

if [ "$FAIL" -gt 0 ]; then
  echo "=== $FAIL test(s) failed ==="
  exit 1
fi
echo "=== All smoke tests passed ==="
