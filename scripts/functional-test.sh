#!/usr/bin/env bash
# API smoke tests — requires dev server on localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

db_query() {
  (cd "$ROOT" && node --input-type=module -e "$1") 2>/dev/null
}

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  OK  $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "  OK  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Public pages ==="
for path in "/" "/m" "/m/login" "/m/register" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

echo "=== Auth: reject bad credentials ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"000","password":"x"}')
assert_status "POST /api/auth/login bad creds" "401" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"000","password":"x"}')
assert_status "POST /api/auth/admin/login bad creds" "401" "$code"

echo "=== Auth: user login ==="
body=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "user login" "$body"

echo "=== Auth: admin login ==="
body=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "admin login" "$body"

echo "=== Protected API without session ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
assert_status "bid without login" "401" "$code"

echo "=== Protected pages with session ==="
for path in "/m" "/m/auction" "/m/drying" "/m/me" "/m/orders"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  assert_status "GET $path (user)" "200" "$code"
done

for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/dict"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  assert_status "GET $path (admin)" "200" "$code"
done

echo "=== Dev third-party token ==="
body=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-user")
if echo "$body" | grep -q '"token"'; then
  echo "  OK  third-party token"
  PASS=$((PASS + 1))
else
  echo "  FAIL third-party token: $body"
  FAIL=$((FAIL + 1))
fi

echo "=== Auction bid ==="
PROJECT_ID=$(db_query "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
console.log(proj?.id ?? '');
await p.\$disconnect();
")

if [[ -n "$PROJECT_ID" ]]; then
  BID_AMOUNT=$(db_query "
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
const p = new PrismaClient();
const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
const min = top
  ? new Decimal(top.amount.toString()).plus(proj.bidStep.toString())
  : new Decimal(proj.startPrice.toString());
console.log(min.toFixed(2));
await p.\$disconnect();
")
  body=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$BID_AMOUNT}")
  assert_json_ok "place bid ($BID_AMOUNT)" "$body"
else
  echo "  FAIL no LIVE auction project found"
  FAIL=$((FAIL + 1))
fi

echo "=== Drying reserve ==="
LISTING_ID=$(db_query "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
console.log(l?.id ?? '');
await p.\$disconnect();
")

if [[ -n "$LISTING_ID" ]]; then
  body=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-07-01\",\"endDate\":\"2026-07-02\"}")
  assert_json_ok "drying reserve" "$body"
else
  echo "  FAIL no OPERATING drying listing found"
  FAIL=$((FAIL + 1))
fi

echo "=== Admin asset create (multipart) ==="
ORG_ID=$(db_query "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const o = await p.organization.findFirst({ where: { code: 'DIV1' } });
console.log(o?.id ?? '');
await p.\$disconnect();
")

if [[ -n "$ORG_ID" ]]; then
  body=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
    -F "orgId=$ORG_ID" \
    -F "type=LAND" \
    -F "name=冒烟测试资产" \
    -F "locationText=测试地点")
  assert_json_ok "admin create asset" "$body"
else
  echo "  FAIL no org found"
  FAIL=$((FAIL + 1))
fi

echo "=== Admin asset reject JSON body ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"x","type":"LAND","name":"x","locationText":"x"}')
assert_status "admin assets JSON body" "400" "$code"

echo "=== Register validation ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"bad"}')
assert_status "register invalid" "400" "$code"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
