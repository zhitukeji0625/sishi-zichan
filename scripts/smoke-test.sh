#!/usr/bin/env bash
# End-to-end smoke test for sishi-zichan (requires dev server on :3000)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$ADMIN_JAR" "$USER_JAR"' EXIT

PASS=0
FAIL=0

check() {
  local name="$1" expect="$2" actual="$3"
  if [ "$actual" = "$expect" ]; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expect, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

json_field() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))" 2>/dev/null || echo ""
}

echo "=== Smoke test: $BASE ==="

# Public pages
check "GET /" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /admin/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

# Admin login (must use /api/auth/admin/login)
ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check "admin login" "True" "$(echo "$ADMIN_RESP" | json_field ok)"

check "GET /admin" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin")"
check "GET /admin/dict" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin/dict")"
check "GET /admin/auctions" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin/auctions")"
check "GET /admin/assets" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin/assets")"
check "GET /admin/drying" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin/drying")"

# Dict categories should exist (query DB directly)
DICT_COUNT=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dictCategory.count().then(c => console.log(c)).finally(() => p.\$disconnect());
" 2>/dev/null)
check "dict categories present" "14" "$DICT_COUNT"

# User login
USER_RESP=$(curl -s -c "$USER_JAR" -b "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check "user login" "True" "$(echo "$USER_RESP" | json_field ok)"

check "GET /m/auction" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_JAR" "$BASE/m/auction")"
check "GET /m/drying" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_JAR" "$BASE/m/drying")"
check "GET /m/me" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_JAR" "$BASE/m/me")"
check "GET /m/orders" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_JAR" "$BASE/m/orders")"

# Third-party token (dev only)
check "GET /api/dev/third-party-token" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test123")"

# Trigger layout cron (refresh demo auction)
curl -s -o /dev/null "$BASE/"

# Get project ID and place bid
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true, startPrice: true, bidStep: true } })
  .then(r => { if (r) console.log(r.id + ' ' + r.startPrice + ' ' + r.bidStep); })
  .finally(() => p.\$disconnect());
" 2>/dev/null | awk '{print $1}')

if [ -n "$PROJECT_ID" ]; then
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } })
  .then(r => {
    if (!r) return;
    const top = r.bids[0]?.amount;
    const min = top ? Number(top) + Number(r.bidStep) : Number(r.startPrice);
    console.log(min);
  })
  .finally(() => p.\$disconnect());
" 2>/dev/null)

  BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  check "place bid" "True" "$(echo "$BID_RESP" | json_field ok)"
else
  echo "✗ no LIVE auction project found"
  FAIL=$((FAIL + 1))
fi

# Drying reservation page
DRYING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ select: { id: true } })
  .then(r => { if (r) console.log(r.id); })
  .finally(() => p.\$disconnect());
" 2>/dev/null)
if [ -n "$DRYING_ID" ]; then
  check "GET /m/drying/[id]" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_JAR" "$BASE/m/drying/$DRYING_ID")"
else
  echo "✗ no drying listing found"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
