#!/usr/bin/env bash
# API smoke test — requires dev server on localhost:3000 and seeded DB.
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check_http() {
  local name="$1" expect="$2" url="$3"
  shift 3
  local code
  code=$(curl -s -o /tmp/smoke_body -w "%{http_code}" "$@" "$url")
  if [ "$code" = "$expect" ]; then
    echo "PASS $name ($code)"
    PASS=$((PASS + 1))
  else
    echo "FAIL $name expected=$expect got=$code"
    head -c 300 /tmp/smoke_body
    echo
    FAIL=$((FAIL + 1))
  fi
}

check_json_ok() {
  local name="$1" file="$2"
  if grep -q '"ok":true' "$file"; then
    echo "PASS $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL $name"
    cat "$file"
    FAIL=$((FAIL + 1))
  fi
}

check_http "home" 200 "$BASE/"
check_http "admin login page" 200 "$BASE/admin/login"
check_http "m home" 200 "$BASE/m"
check_http "m login" 200 "$BASE/m/login"
check_http "m auction" 200 "$BASE/m/auction"

curl -s -c /tmp/user_cookies -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}' > /tmp/user_login.json
check_json_ok "user login" /tmp/user_login.json

curl -s -c /tmp/admin_cookies -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}' > /tmp/admin_login.json
check_json_ok "admin login" /tmp/admin_login.json

check_http "admin assets" 200 "$BASE/admin/assets" -b /tmp/admin_cookies
check_http "admin dict" 200 "$BASE/admin/dict" -b /tmp/admin_cookies
check_http "admin auctions" 200 "$BASE/admin/auctions" -b /tmp/admin_cookies
check_http "dev third-party-token" 200 "$BASE/api/dev/third-party-token?u_id=test123"

# Dict categories should be seeded
DICT_COUNT=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dictCategory.count().then(c => { console.log(c); }).finally(() => p.\$disconnect());
" 2>/dev/null)
if [ "${DICT_COUNT:-0}" -gt 0 ]; then
  echo "PASS dict seeded (count=$DICT_COUNT)"
  PASS=$((PASS + 1))
else
  echo "FAIL dict seeded (count=${DICT_COUNT:-0})"
  FAIL=$((FAIL + 1))
fi

# Trigger layout refresh (demo auction reset) and test bidding
curl -s "$BASE/" > /dev/null
AUCTION_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ orderBy: { createdAt: 'desc' } })
  .then(a => console.log(a?.id ?? ''))
  .finally(() => p.\$disconnect());
" 2>/dev/null)

if [ -n "$AUCTION_ID" ]; then
  START_PRICE=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findUnique({ where: { id: '$AUCTION_ID' } })
  .then(a => console.log(a?.startPrice?.toString() ?? ''))
  .finally(() => p.\$disconnect());
" 2>/dev/null)
  curl -s -b /tmp/user_cookies -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H 'Content-Type: application/json' \
    -d "{\"amount\":$START_PRICE}" > /tmp/bid.json
  check_json_ok "auction bid" /tmp/bid.json
else
  echo "FAIL auction bid (no project)"
  FAIL=$((FAIL + 1))
fi

echo "SUMMARY pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
