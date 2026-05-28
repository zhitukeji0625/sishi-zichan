#!/bin/bash
# Integration smoke tests for key API routes and pages
set -e
BASE="http://localhost:3000"
COOKIE_JAR="/tmp/sishi-test-cookies.txt"
ADMIN_JAR="/tmp/sishi-admin-cookies.txt"
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $name (expected HTTP $expected, got $actual)"
    FAIL=$((FAIL + 1))
  else
    echo "OK: $name"
  fi
}

check_json() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -q "$pattern"; then
    echo "OK: $name"
  else
    echo "FAIL: $name (body missing '$pattern')"
    echo "  body: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Page smoke tests ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

echo ""
echo "=== User auth ==="
rm -f "$COOKIE_JAR"
LOGIN=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
CODE=$(echo "$LOGIN" | tail -1)
BODY=$(echo "$LOGIN" | sed '$d')
check "POST /api/auth/login" "200" "$CODE"
check_json "login success" '"ok":true' "$BODY"

echo ""
echo "=== Admin auth ==="
rm -f "$ADMIN_JAR"
ALOGIN=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
CODE=$(echo "$ALOGIN" | tail -1)
BODY=$(echo "$ALOGIN" | sed '$d')
check "POST /api/auth/admin/login" "200" "$CODE"
check_json "admin login success" '"ok":true' "$BODY"

echo ""
echo "=== Protected admin page ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
check "GET /admin (authenticated)" "200" "$code"

echo ""
echo "=== Admin assets API (POST only) ==="
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" -F "orgId=x")
check "POST /api/admin/assets without auth" "401" "$UNAUTH"

echo ""
echo "=== Auction list page ==="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")
check "GET /m/auction" "200" "$code"

echo ""
echo "=== Third-party token (dev) ==="
TP=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?phone=13800138000")
CODE=$(echo "$TP" | tail -1)
BODY=$(echo "$TP" | sed '$d')
check "GET /api/dev/third-party-token" "200" "$CODE"

TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
  SSO=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  CODE=$(echo "$SSO" | tail -1)
  check "POST /api/auth/third-party" "200" "$CODE"
else
  echo "SKIP: third-party SSO (no token in dev response)"
fi

echo ""
echo "=== Logout ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
check "POST /api/auth/logout" "200" "$code"

echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "=== $FAIL test(s) failed ==="
  exit 1
fi
echo "=== All integration tests passed ==="
