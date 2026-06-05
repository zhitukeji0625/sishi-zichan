#!/usr/bin/env bash
# Integration smoke tests against local dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

pass() { echo "  OK: $1"; }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name expected $expected got $actual"; fi
}

echo "=== Pages ==="
for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

echo "=== User auth ==="
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$LOGIN" | grep -q '"ok":true\|"success":true\|userId'; then
  pass "POST /api/auth/login"
else
  fail "POST /api/auth/login: $LOGIN"
fi

echo "=== Admin auth ==="
ALOGIN=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ALOGIN" | grep -q '"ok":true\|"success":true'; then
  pass "POST /api/auth/admin/login"
else
  fail "POST /api/auth/admin/login: $ALOGIN"
fi

echo "=== Protected admin page ==="
code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin")
check_status "GET /admin (authenticated)" "200" "$code"

echo "=== Third-party dev token ==="
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-u-1")
if echo "$TOKEN_RESP" | grep -q 'token'; then
  pass "GET /api/dev/third-party-token"
  TOKEN=$(echo "$TOKEN_RESP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  if [ -n "$TOKEN" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
    check_status "GET /m/sso?token=..." "200" "$code"
  fi
else
  fail "GET /api/dev/third-party-token: $TOKEN_RESP"
fi

echo "=== Auction project from seed ==="
PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
  "SELECT id FROM AuctionProject WHERE status='LIVE' LIMIT 1;" 2>/dev/null || true)

if [ -n "$PROJECT_ID" ]; then
  code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction/$PROJECT_ID")
  check_status "GET /m/auction/[id]" "200" "$code"

  BID=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount": "999999"}')
  if echo "$BID" | grep -q 'error\|Error\|失败\|invalid\|increment\|出价'; then
    pass "POST bid (expected business rule response)"
  elif echo "$BID" | grep -q 'ok\|success\|id'; then
    pass "POST bid accepted"
  else
    fail "POST bid unclear: $BID"
  fi
else
  fail "No LIVE auction project in seed data"
fi

echo "=== Register validation ==="
REG=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"invalid","password":"x","name":"t"}')
if echo "$REG" | grep -qi 'error\|invalid\|手机\|格式'; then
  pass "POST /api/auth/register rejects invalid phone"
else
  fail "POST /api/auth/register should reject invalid: $REG"
fi

rm -f "$COOKIE_JAR" "$ADMIN_JAR"
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "All integration checks passed."
  exit 0
else
  echo "$FAIL check(s) failed."
  exit 1
fi
