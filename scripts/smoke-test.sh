#!/usr/bin/env bash
# Functional smoke tests against local dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

fail() { echo "FAIL: $1"; exit 1; }
ok() { echo "OK: $1"; }

# --- Public pages ---
for path in / /m /admin/login /m/login /m/register /m/auction /m/drying; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  [[ "$code" == "200" ]] || fail "$path returned $code"
done
ok "public pages"

# --- Admin login ---
ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$ADMIN_RESP" | grep -q '"ok":true' || fail "admin login: $ADMIN_RESP"
ok "admin login"

# --- Admin protected page ---
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
[[ "$code" == "200" ]] || fail "admin dashboard $code"
ok "admin dashboard"

# --- Admin assets page (POST-only API; list is server-rendered) ---
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/assets")
[[ "$code" == "200" ]] || fail "admin assets page $code"
ok "admin assets page"

# --- End user login ---
USER_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$USER_RESP" | grep -q '"ok":true' || fail "user login: $USER_RESP"
ok "user login"

# --- Mobile me page ---
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/me")
[[ "$code" == "200" ]] || fail "m/me $code"
ok "user me page"

# --- Third-party token (dev) ---
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
TOKEN=$(echo "$TOKEN_RESP" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
[[ -n "${TOKEN:-}" ]] || fail "third-party token: $TOKEN_RESP"
ok "dev third-party token"

# --- Third-party SSO login ---
SSO_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
echo "$SSO_RESP" | grep -q '"ok":true' || fail "third-party auth: $SSO_RESP"
ok "third-party SSO"

# --- Find live auction from seed and test bid endpoint shape ---
# Bid without valid project should 4xx not 500
BID_CODE=$(curl -s -o /tmp/bid_resp.json -w "%{http_code}" -b "$COOKIE_JAR" \
  -X POST "$BASE/api/m/auction/invalid-id/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":"100"}')
[[ "$BID_CODE" != "500" ]] || fail "bid invalid project returned 500: $(cat /tmp/bid_resp.json)"
ok "bid endpoint does not 500 on bad id ($BID_CODE)"

echo ""
echo "All smoke tests passed."
