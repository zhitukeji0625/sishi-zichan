#!/usr/bin/env bash
# Smoke tests for key routes and APIs
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/sishi-smoke-cookies.txt"
ADMIN_JAR="/tmp/sishi-smoke-admin-cookies.txt"
FAIL=0

pass() { echo "  OK: $1"; }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

check_http() {
  local desc="$1" url="$2" expect="${3:-200}"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$url" || echo "000")
  if [[ "$code" == "$expect" ]]; then pass "$desc ($code)"; else fail "$desc expected $expect got $code"; fi
}

check_json_field() {
  local desc="$1" body="$2" pattern="$3"
  if echo "$body" | grep -qE "$pattern"; then pass "$desc"; else fail "$desc (body: ${body:0:200})"; fi
}

echo "=== Pages ==="
check_http "Home" "$BASE/"
check_http "Admin login page" "$BASE/admin/login"
check_http "Mobile home" "$BASE/m"
check_http "Mobile login" "$BASE/m/login"

echo "=== User auth ==="
rm -f "$COOKIE_JAR"
LOGIN=$(curl -sS -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_json_field "User login success" "$LOGIN" '"ok":\s*true|"success":\s*true|userId|token'

echo "=== Admin auth ==="
rm -f "$ADMIN_JAR"
ALOGIN=$(curl -sS -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json_field "Admin login success" "$ALOGIN" '"ok":\s*true|"success":\s*true|adminId'

echo "=== Dev third-party token ==="
TP=$(curl -sS "$BASE/api/dev/third-party-token?u_id=test-smoke-user")
check_json_field "Third-party token" "$TP" 'token'

echo "=== Protected mobile API (bid needs auth) ==="
# Get auction project from seed - try bid without cookie should fail
BID_NOAUTH=$(curl -sS -w "\n%{http_code}" -X POST "$BASE/api/m/auction/1/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":100}' 2>/dev/null || true)
if echo "$BID_NOAUTH" | tail -1 | grep -qE '401|403'; then
  pass "Bid without auth rejected"
else
  fail "Bid without auth should be 401/403"
fi

echo "=== Admin assets API (POST only) ==="
ASSETS=$(curl -sS -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" -w "\n%{http_code}")
CODE=$(echo "$ASSETS" | tail -1)
if [[ "$CODE" == "400" ]]; then
  pass "Admin assets POST validates form ($CODE)"
else
  fail "Admin assets POST expected 400 without form got $CODE"
fi

echo "=== Dict labels on auction page ==="
AUCTION_HTML=$(curl -sS "$BASE/m/auction")
if echo "$AUCTION_HTML" | grep -q '已结束'; then
  pass "Auction page shows Chinese status label"
elif echo "$AUCTION_HTML" | grep -q 'ENDED'; then
  fail "Auction page shows raw enum ENDED instead of 已结束"
else
  pass "Auction page loaded (no projects or labels ok)"
fi

echo "=== Register validation ==="
REG=$(curl -sS -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"invalid","password":"x"}')
if echo "$REG" | grep -qiE 'error|invalid|失败|格式'; then
  pass "Register rejects invalid phone"
else
  fail "Register should reject invalid input"
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "All smoke tests passed."
  exit 0
else
  echo "$FAIL test(s) failed."
  exit 1
fi
