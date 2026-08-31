#!/usr/bin/env bash
# End-to-end smoke tests against a running Next.js dev server.
set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

expect_code() {
  local name="$1" path="$2" expect="$3" extra="${4:-}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" $extra "$BASE$path")
  if [ "$code" = "$expect" ]; then pass "$name"; else fail "$name (expected $expect, got $code)"; fi
}

echo "Smoke testing $BASE"

expect_code "GET /" "/" "200"
expect_code "GET /m" "/m" "200"
expect_code "GET /m/login" "/m/login" "200"
expect_code "GET /m/auction" "/m/auction" "200"
expect_code "GET /m/drying" "/m/drying" "200"
expect_code "GET /admin/login" "/admin/login" "200"
expect_code "GET /admin (redirect when unauthed)" "/admin" "307"

ADMIN_COOKIE=$(curl -s -c - -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}' | awk '/sishi_admin_session/ {print $NF}')
if [ -n "$ADMIN_COOKIE" ]; then pass "POST /api/auth/admin/login"; else fail "POST /api/auth/admin/login"; fi

expect_code "GET /admin (authed)" "/admin" "200" "-b sishi_admin_session=$ADMIN_COOKIE"
expect_code "GET /admin/dict" "/admin/dict" "200" "-b sishi_admin_session=$ADMIN_COOKIE"
expect_code "GET /admin/assets" "/admin/assets" "200" "-b sishi_admin_session=$ADMIN_COOKIE"
expect_code "GET /admin/auctions" "/admin/auctions" "200" "-b sishi_admin_session=$ADMIN_COOKIE"

USER_COOKIE=$(curl -s -c - -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}' | awk '/sishi_user_session/ {print $NF}')
if [ -n "$USER_COOKIE" ]; then pass "POST /api/auth/login"; else fail "POST /api/auth/login"; fi

expect_code "GET /m/me (authed)" "/m/me" "200" "-b sishi_user_session=$USER_COOKIE"
expect_code "GET /m/orders" "/m/orders" "200" "-b sishi_user_session=$USER_COOKIE"

TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test")
if echo "$TOKEN_RESP" | grep -q '"token"'; then pass "GET /api/dev/third-party-token"; else fail "GET /api/dev/third-party-token ($TOKEN_RESP)"; fi

PROJECT_ID=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then(r => { process.stdout.write(r?.id || ''); })
  .finally(() => p.\$disconnect());
" 2>/dev/null || true)

if [ -n "$PROJECT_ID" ]; then
  pass "DB has LIVE auction"
  expect_code "GET /m/auction/[id]" "/m/auction/$PROJECT_ID" "200" "-b sishi_user_session=$USER_COOKIE"
  BID=$(curl -s -X POST -b "sishi_user_session=$USER_COOKIE" \
    -H 'Content-Type: application/json' \
    -d '{"amount":8200}' \
    "$BASE/api/m/auction/$PROJECT_ID/bid")
  if echo "$BID" | grep -qE '"ok":true|"id"'; then pass "POST bid"; else fail "POST bid ($BID)"; fi
else
  fail "DB has LIVE auction"
fi

DICT_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dictCategory.count()
  .then(c => { process.stdout.write(String(c)); })
  .finally(() => p.\$disconnect());
" 2>/dev/null || echo 0)
if [ "${DICT_COUNT:-0}" -gt 0 ]; then pass "dict categories seeded ($DICT_COUNT)"; else fail "dict categories seeded"; fi

echo "---"
echo "PASS=$PASS FAIL=$FAIL"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
