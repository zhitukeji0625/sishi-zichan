#!/bin/bash
# Integration smoke tests for API and pages
set -e
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_COOKIE=$(mktemp)
FAIL=0

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; FAIL=1; }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name expected $expected got $actual"; fi
}

echo "=== Page routes ==="
for path in "/" "/m" "/m/login" "/m/register" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done
# Unauthenticated /admin redirects to login
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
check_status "GET /admin (unauthenticated redirect)" "307" "$code"

echo ""
echo "=== User auth ==="
# Login
RESP=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
if [ "$CODE" = "200" ]; then pass "POST /api/auth/login"; else fail "POST /api/auth/login ($CODE) $BODY"; fi

# Protected mobile page with cookie
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/me")
check_status "GET /m/me (authenticated)" "200" "$code"

echo ""
echo "=== Admin auth ==="
RESP=$(curl -s -w "\n%{http_code}" -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
if [ "$CODE" = "200" ]; then pass "POST /api/auth/admin/login"; else fail "POST /api/auth/admin/login ($CODE) $BODY"; fi

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin/assets")
check_status "GET /admin/assets (authenticated)" "200" "$code"

echo ""
echo "=== Dev third-party token ==="
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-user-001")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
if [ "$CODE" = "200" ] && echo "$BODY" | grep -q '"token"'; then
  pass "GET /api/dev/third-party-token"
  TOKEN=$(echo "$BODY" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
else
  fail "GET /api/dev/third-party-token ($CODE)"
  TOKEN=""
fi

if [ -n "$TOKEN" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
  check_status "GET /m/sso?token=..." "200" "$code" || true
  # SSO may redirect
  code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/m/sso?token=$TOKEN")
  if [ "$code" = "200" ] || [ "$code" = "302" ]; then pass "GET /m/sso redirect ($code)"; else fail "GET /m/sso redirect ($code)"; fi
fi

echo ""
echo "=== Admin API (POST only) ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/api/admin/assets")
if [ "$code" = "405" ]; then pass "GET /api/admin/assets returns 405 (POST only)"; else fail "GET /api/admin/assets ($code)"; fi

echo ""
echo "=== Auction bid (needs auth) ==="
# Get auction project from seed - try bid endpoint
AUCTION_ID=$(curl -s -b "$COOKIE_JAR" "$BASE/m/auction" 2>/dev/null | grep -oP 'auction/\K[0-9]+' | head -1 || echo "")
if [ -z "$AUCTION_ID" ]; then
  # fallback: query prisma or use known seed id
  AUCTION_ID="1"
fi
RESP=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":100}')
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
# 200 success, 400 business rule, 401 unauthorized - all indicate route works
if [ "$CODE" = "200" ] || [ "$CODE" = "400" ] || [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  pass "POST /api/m/auction/$AUCTION_ID/bid ($CODE)"
else
  fail "POST /api/m/auction/$AUCTION_ID/bid ($CODE) $BODY"
fi

echo ""
echo "=== Invalid login ==="
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
CODE=$(echo "$RESP" | tail -1)
if [ "$CODE" = "401" ] || [ "$CODE" = "400" ]; then pass "POST login wrong password ($CODE)"; else fail "POST login wrong password ($CODE)"; fi

rm -f "$COOKIE_JAR" "$ADMIN_COOKIE"

echo ""
if [ "$FAIL" -eq 0 ]; then echo "All integration tests passed."; exit 0; else echo "Some tests failed."; exit 1; fi
