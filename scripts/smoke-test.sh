#!/bin/bash
# Smoke test for key pages and API endpoints
set -e
BASE="http://localhost:3000"
FAIL=0

check_http() {
  local method="$1" url="$2" expected="$3" extra="${4:-}"
  local code
  if [ "$method" = "GET" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" $extra "$url")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" $extra "$url")
  fi
  if [ "$code" != "$expected" ]; then
    echo "FAIL $method $url expected $expected got $code"
    FAIL=$((FAIL + 1))
  else
    echo "OK   $method $url -> $code"
  fi
}

echo "=== Pages ==="
check_http GET "$BASE/" 200
check_http GET "$BASE/m" 200
check_http GET "$BASE/m/login" 200
check_http GET "$BASE/m/register" 200
check_http GET "$BASE/m/auction" 200
check_http GET "$BASE/m/drying" 200
check_http GET "$BASE/admin/login" 200

echo "=== User auth ==="
# Login
RESP=$(curl -s -c /tmp/user-cookies.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "Login response: $RESP"
if echo "$RESP" | grep -q '"ok":true'; then
  echo "OK   POST /api/auth/login"
else
  echo "FAIL POST /api/auth/login"
  FAIL=$((FAIL + 1))
fi

echo "=== Admin auth ==="
RESP=$(curl -s -c /tmp/admin-cookies.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "Admin login: $RESP"
if echo "$RESP" | grep -q '"ok":true'; then
  echo "OK   POST /api/auth/admin/login"
else
  echo "FAIL POST /api/auth/admin/login"
  FAIL=$((FAIL + 1))
fi

check_http GET "$BASE/admin" 200 "-b /tmp/admin-cookies.txt"
check_http GET "$BASE/m/me" 200 "-b /tmp/user-cookies.txt"

echo "=== Dev third-party token ==="
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-smoke-user")
echo "Token: $TOKEN_RESP"
TOKEN=$(echo "$TOKEN_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
  check_http GET "$BASE/m/sso?token=$TOKEN" 200
  echo "OK   third-party SSO page"
else
  echo "FAIL third-party token"
  FAIL=$((FAIL + 1))
fi

echo "=== Summary ==="
if [ "$FAIL" -gt 0 ]; then
  echo "$FAIL test(s) failed"
  exit 1
fi
echo "All smoke tests passed"
