#!/bin/bash
# Integration smoke tests for sishi-zichan
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAIL=1; }

check_status() {
  local name="$1" url="$2" expected="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" = "$expected" ]; then pass "$name ($code)"; else fail "$name expected $expected got $code"; fi
}

echo "=== Pages ==="
check_status "Home" "$BASE/" "200"
check_status "Mobile home" "$BASE/m" "200"
check_status "Admin login" "$BASE/admin/login" "200"
check_status "Mobile login" "$BASE/m/login" "200"
check_status "Mobile register" "$BASE/m/register" "200"

echo "=== User auth ==="
LOGIN_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$LOGIN_RESP" | grep -qE '"ok"|"success"|"user"'; then
  pass "User login"
else
  fail "User login: $LOGIN_RESP"
fi

echo "=== Admin auth ==="
ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ADMIN_RESP" | grep -qE '"ok"|"success"|"admin"'; then
  pass "Admin login"
else
  fail "Admin login: $ADMIN_RESP"
fi

echo "=== Protected routes (no auth) ==="
check_status "Admin dashboard unauth redirect" "$BASE/admin" "307"

echo "=== Dev third-party token ==="
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-u-001")
if echo "$TOKEN_RESP" | grep -q '"token"'; then
  pass "Dev third-party token"
  TOKEN=$(echo "$TOKEN_RESP" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
  SSO_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
  if [ "$SSO_CODE" = "200" ] || [ "$SSO_CODE" = "307" ] || [ "$SSO_CODE" = "302" ]; then
    pass "SSO page ($SSO_CODE)"
  else
    fail "SSO page expected 200/302/307 got $SSO_CODE"
  fi
else
  fail "Dev third-party token: $TOKEN_RESP"
fi

echo "=== Admin pages (with session) ==="
ADMIN_DASH=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
if [ "$ADMIN_DASH" = "200" ]; then pass "Admin assets page"; else fail "Admin assets page got $ADMIN_DASH"; fi

echo "=== Mobile API (authenticated) ==="
PROJECT_ID=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then((x) => { console.log(x?.id ?? ''); })
  .finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)
if [ -n "$PROJECT_ID" ]; then
  BID_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":1}')
  if echo "$BID_RESP" | grep -qE '"ok"|"error"'; then pass "Auction bid API"; else fail "Auction bid API: $BID_RESP"; fi
else
  fail "No LIVE auction project for bid test"
fi

echo "=== Mobile pages (authenticated) ==="
ME_CODE=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/me")
if [ "$ME_CODE" = "200" ]; then pass "Mobile me (auth)"; else fail "Mobile me got $ME_CODE"; fi

AUCTION_CODE=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction")
if [ "$AUCTION_CODE" = "200" ]; then pass "Mobile auction list"; else fail "Mobile auction got $AUCTION_CODE"; fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "All integration tests passed."
  exit 0
else
  echo "Some integration tests failed."
  exit 1
fi
