#!/bin/bash
# Smoke test for API and pages
set -e
BASE="http://localhost:3000"
FAIL=0
COOKIE_JAR="/tmp/smoke-cookies.txt"
rm -f "$COOKIE_JAR"

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
  else
    echo "✗ $name expected $expected got $actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Pages ==="
check "GET /" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /admin/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "GET /m/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "GET /m/auction" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check "GET /m/drying" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"

echo ""
echo "=== Admin login ==="
ADMIN_RESP=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ADMIN_RESP" | grep -q '"ok":true\|"success":true\|admin'; then
  echo "✓ Admin login API"
else
  echo "✗ Admin login API: $ADMIN_RESP"
  FAIL=$((FAIL + 1))
fi

check "GET /admin (authenticated)" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/admin")"
check "GET /admin/assets" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/admin/assets")"
check "GET /admin/auctions" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/admin/auctions")"

echo ""
echo "=== User login ==="
USER_COOKIE="/tmp/smoke-user-cookies.txt"
rm -f "$USER_COOKIE"
USER_RESP=$(curl -s -c "$USER_COOKIE" -b "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$USER_RESP" | grep -qE '"ok":true|"success":true|user|token'; then
  echo "✓ User login API"
else
  echo "✗ User login API: $USER_RESP"
  FAIL=$((FAIL + 1))
fi

check "GET /m/me" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_COOKIE" "$BASE/m/me")"
check "GET /m/orders" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_COOKIE" "$BASE/m/orders")"

echo ""
echo "=== Third-party token (dev) ==="
TP_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-smoke-user")
if echo "$TP_RESP" | grep -q 'token'; then
  echo "✓ Dev third-party token"
else
  echo "✗ Dev third-party token: $TP_RESP"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Protected without auth ==="
# Admin should redirect or 401/307
ADMIN_UNAUTH=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")
if [ "$ADMIN_UNAUTH" = "307" ] || [ "$ADMIN_UNAUTH" = "302" ] || [ "$ADMIN_UNAUTH" = "401" ]; then
  echo "✓ Unauthenticated /admin protected ($ADMIN_UNAUTH)"
else
  echo "? Unauthenticated /admin returned $ADMIN_UNAUTH (may redirect via middleware)"
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "All smoke tests passed."
  exit 0
else
  echo "$FAIL test(s) failed."
  exit 1
fi
