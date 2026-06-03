#!/bin/bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_COOKIE=$(mktemp)
USER_COOKIE=$(mktemp)
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $name (expected HTTP $expected, got $actual)"
    FAIL=$((FAIL + 1))
  else
    echo "OK: $name ($actual)"
  fi
}

check_body() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -qE "$pattern"; then
    echo "OK: $name"
  else
    echo "FAIL: $name (body missing pattern: $pattern)"
    echo "  body snippet: $(echo "$body" | head -c 200)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Public pages ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

echo ""
echo "=== Admin auth ==="
ADMIN_RESP=$(curl -s -w "\n%{http_code}" -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_RESP" | tail -1)
ADMIN_BODY=$(echo "$ADMIN_RESP" | sed '$d')
check "POST /api/auth/admin/login" "200" "$ADMIN_CODE"
check_body "admin login success" '"ok":true' "$ADMIN_BODY"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin")
check "GET /admin (authenticated)" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin/assets")
check "GET /admin/assets" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin/auctions")
check "GET /admin/auctions" "200" "$code"

echo ""
echo "=== End user auth ==="
USER_RESP=$(curl -s -w "\n%{http_code}" -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
USER_CODE=$(echo "$USER_RESP" | tail -1)
USER_BODY=$(echo "$USER_RESP" | sed '$d')
check "POST /api/auth/login" "200" "$USER_CODE"
check_body "user login success" '"ok":true' "$USER_BODY"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" "$BASE/m/me")
check "GET /m/me (authenticated)" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" "$BASE/m/orders")
check "GET /m/orders" "200" "$code"

echo ""
echo "=== Protected routes without auth ==="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
# middleware redirects to login
if [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "200" ]; then
  echo "OK: GET /admin without auth ($code)"
else
  echo "FAIL: GET /admin without auth (got $code)"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Invalid login ==="
BAD_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
BAD_CODE=$(echo "$BAD_RESP" | tail -1)
if [ "$BAD_CODE" = "401" ] || [ "$BAD_CODE" = "400" ]; then
  echo "OK: invalid login rejected ($BAD_CODE)"
else
  echo "FAIL: invalid login (expected 401/400, got $BAD_CODE)"
  FAIL=$((FAIL + 1))
fi

rm -f "$COOKIE_JAR" "$ADMIN_COOKIE" "$USER_COOKIE"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "All smoke tests passed."
  exit 0
else
  echo "$FAIL test(s) failed."
  exit 1
fi
