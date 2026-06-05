#!/usr/bin/env bash
# Integration smoke tests against running dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

fail=0
pass() { echo "  OK: $1"; }
err() { echo "  FAIL: $1"; fail=1; }

check_http() {
  local name="$1" url="$2" expect="$3"
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" = "$expect" ]; then pass "$name ($code)"; else err "$name expected $expect got $code"; fi
}

echo "=== Page smoke tests ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login"; do
  check_http "GET $path" "$BASE$path" "200"
done

echo "=== Admin login ==="
ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ADMIN_RESP" | grep -q '"ok":true\|"success":true\|"token"'; then
  pass "admin login JSON"
else
  echo "  Response: $ADMIN_RESP"
  err "admin login"
fi

echo "=== User login ==="
USER_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$USER_RESP" | grep -qE '"ok":true|"success":true|"user"'; then
  pass "user login JSON"
else
  echo "  Response: $USER_RESP"
  err "user login"
fi

echo "=== Protected admin route (with cookie) ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
if [ "$code" = "200" ]; then pass "admin dashboard"; else err "admin dashboard got $code"; fi

echo "=== Protected mobile route (with cookie) ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/me")
if [ "$code" = "200" ]; then pass "m/me"; else err "m/me got $code"; fi

echo "=== Third-party dev token ==="
TP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
if echo "$TP" | grep -qE 'token|jwt'; then
  pass "third-party token"
  TOKEN=$(echo "$TP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  if [ -n "$TOKEN" ]; then
    SSO_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
    if [ "$SSO_CODE" = "200" ] || [ "$SSO_CODE" = "307" ] || [ "$SSO_CODE" = "302" ]; then
      pass "SSO redirect ($SSO_CODE)"
    else
      err "SSO got $SSO_CODE"
    fi
  fi
else
  echo "  Response: $TP"
  err "third-party token"
fi

echo "=== Auction bid API (needs auth) ==="
AUCTION_HTML=$(curl -s -b "$COOKIE_JAR" "$BASE/m/auction")
PROJECT_ID=$(echo "$AUCTION_HTML" | grep -oE 'cm[a-z0-9]{20,}' | head -1)
if [ -z "$PROJECT_ID" ]; then
  err "no auction project on /m/auction"
else
  BID_AMOUNT=8000
  BID_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$BID_AMOUNT}")
  if echo "$BID_RESP" | grep -q '"ok":true'; then
    pass "bid API placed bid on $PROJECT_ID"
  elif echo "$BID_RESP" | grep -qE 'error|出价'; then
    pass "bid API responded ($BID_RESP)"
  else
    err "bid API unexpected: $BID_RESP"
  fi
fi

echo "=== Logout ==="
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout" > /dev/null
curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout" > /dev/null
pass "logout endpoints"

echo ""
if [ "$fail" -eq 0 ]; then
  echo "All smoke tests passed."
  exit 0
else
  echo "Some smoke tests failed."
  exit 1
fi
