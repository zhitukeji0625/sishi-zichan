#!/usr/bin/env bash
# Functional smoke tests against running dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

pass() { echo "  OK: $1"; }
fail() { echo "  FAIL: $1"; FAIL=1; }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then pass "$name ($actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

echo "=== Smoke tests @ $BASE ==="

# Public pages
for path in "/" "/m" "/m/login" "/m/register" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

# User login
LOGIN=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$LOGIN" | grep -q '"ok":true' && pass "user login" || fail "user login: $LOGIN"

# Protected mobile page (with session)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/me")
check_status "GET /m/me (authenticated)" "200" "$code"

# Admin login
ALOGIN=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$ALOGIN" | grep -q '"ok":true' && pass "admin login" || fail "admin login: $ALOGIN"

# Admin pages
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/audit"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  check_status "GET $path (admin)" "200" "$code"
done

# Admin assets API is POST-only (create asset)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets")
if [[ "$code" == "400" || "$code" == "401" ]]; then
  pass "POST /api/admin/assets reachable ($code)"
else
  fail "POST /api/admin/assets unexpected $code"
fi

# Auction list page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/auction")
check_status "GET /m/auction" "200" "$code"

# Third-party token (dev)
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
echo "$TOKEN_RESP" | grep -q '"token"' && pass "dev third-party token" || fail "dev token: $TOKEN_RESP"

TOKEN=$(echo "$TOKEN_RESP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [[ -n "$TOKEN" ]]; then
  SSO=$(curl -s -c "$COOKIE_JAR" -L -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
  # SSO may redirect; 200 or 307 acceptable
  if [[ "$SSO" == "200" || "$SSO" == "307" || "$SSO" == "302" ]]; then
    pass "SSO redirect ($SSO)"
  else
    fail "SSO ($SSO)"
  fi
fi

# Logout (fresh jar — SSO step above may have re-authenticated)
LOGOUT_JAR=$(mktemp)
curl -s -c "$LOGOUT_JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}' > /dev/null
curl -s -c "$LOGOUT_JAR" -b "$LOGOUT_JAR" -X POST "$BASE/api/auth/logout" > /dev/null
ME_HTML=$(curl -s -b "$LOGOUT_JAR" "$BASE/m/me")
if echo "$ME_HTML" | grep -q 'NEXT_REDIRECT.*\/m\/login\|url=/m/login'; then
  pass "logout clears session (/m/me redirects to login)"
else
  fail "logout should redirect /m/me to login"
fi
rm -f "$LOGOUT_JAR"

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "=== All smoke tests passed ==="
  exit 0
else
  echo "=== Some tests failed ==="
  exit 1
fi
