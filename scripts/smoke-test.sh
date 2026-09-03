#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

check_code() {
  local name="$1" code="$2" expect="$3"
  if [ "$code" = "$expect" ]; then pass "$name ($code)"
  else fail "$name (got $code, want $expect)"; fi
}

echo "=== Smoke test against $BASE ==="

for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_code "GET $path" "$code" "200"
done

ADMIN_RESP=$(curl -s -c /tmp/admin_cookies.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "Admin login: $ADMIN_RESP"
if echo "$ADMIN_RESP" | grep -q '"ok":true'; then pass "admin login"
else fail "admin login"; fi

for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/dict" "/admin/config" "/admin/audit"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/admin_cookies.txt "$BASE$path")
  check_code "GET $path (admin)" "$code" "200"
done

USER_RESP=$(curl -s -c /tmp/user_cookies.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "User login: $USER_RESP"
if echo "$USER_RESP" | grep -q '"ok":true'; then pass "user login"
else fail "user login"; fi

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/payments/mock" -H "Content-Type: application/json" -d '{}')
check_code "POST /api/m/payments/mock (no auth)" "$code" "401"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
check_code "POST /api/upload (no auth)" "$code" "401"

code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/admin_cookies.txt -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')
check_code "POST /api/upload (no file)" "$code" "400"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test123")
check_code "GET /api/dev/third-party-token" "$code" "200"

DICT_CAT_COUNT=$(cd "$(dirname "$0")/.." && npx tsx -e 'import {PrismaClient} from "@prisma/client"; const p=new PrismaClient(); p.dictCategory.count().then(c=>{console.log(c);return p.$disconnect()})' 2>/dev/null | tail -1)
if [ "${DICT_CAT_COUNT:-0}" -ge 14 ]; then pass "dict categories present ($DICT_CAT_COUNT)"
else fail "dict categories missing (count=${DICT_CAT_COUNT:-0})"; fi

AUCTION_HTML=$(curl -s -b /tmp/user_cookies.txt "$BASE/m/auction")
PROJECT_ID=$(echo "$AUCTION_HTML" | grep -oE '/m/auction/c[a-z0-9]+' | head -1 | sed 's|/m/auction/||' || true)
if [ -n "$PROJECT_ID" ]; then
  echo "Found project: $PROJECT_ID"
  DETAIL=$(curl -s -b /tmp/user_cookies.txt "$BASE/m/auction/$PROJECT_ID")
  MIN_BID=$(echo "$DETAIL" | grep -oE '最低 ¥[0-9.]+' | head -1 | grep -oE '[0-9.]+$' || true)
  STEP=200
  if [ -z "$MIN_BID" ]; then MIN_BID=8000; fi
  BID_AMT=${MIN_BID%.*}
  BID_RESP=$(curl -s -b /tmp/user_cookies.txt -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$BID_AMT}")
  echo "Bid $BID_AMT: $BID_RESP"
  if echo "$BID_RESP" | grep -q '"ok":true'; then
    pass "bid at min price"
  else
    RETRY=$(echo "$BID_RESP" | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
    if [ -n "$RETRY" ]; then
      BID_AMT=${RETRY%.*}
      BID_RESP=$(curl -s -b /tmp/user_cookies.txt -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
        -H "Content-Type: application/json" -d "{\"amount\":$BID_AMT}")
      echo "Bid retry $BID_AMT: $BID_RESP"
    fi
    if echo "$BID_RESP" | grep -q '"ok":true'; then pass "bid at min increment"
    else fail "bid failed: $BID_RESP"; fi
  fi
else
  fail "no auction project found"
fi

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/icon")
check_code "GET /icon (favicon)" "$code" "200"

echo "=== RESULT: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
