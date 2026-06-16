#!/usr/bin/env bash
# API smoke tests — requires server on http://localhost:3000
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
PASS=0
FAIL=0

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  OK  $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Functional API tests ($BASE) ==="

# 1. Portal
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "GET /" "200" "$code"

# 2. Mobile home
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
assert_status "GET /m" "200" "$code"

# 3. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "GET /admin/login" "200" "$code"

# 4. User login — bad creds
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"000","password":"bad"}')
assert_status "POST /api/auth/login (bad)" "401" "$code"

# 5. User login — good creds
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
assert_status "POST /api/auth/login" "200" "$code"

# 6. Admin login
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
assert_status "POST /api/auth/admin/login" "200" "$code"

# 7. Admin assets — unauthenticated
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
assert_status "POST /api/admin/assets (no auth)" "401" "$code"

# 8. Admin assets — non-multipart
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
assert_status "POST /api/admin/assets (not multipart)" "400" "$code"

# 9. Upload — non-multipart
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
assert_status "POST /api/upload (not multipart)" "400" "$code"

# 10. Bid — unauthenticated
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
assert_status "POST bid (no auth)" "401" "$code"

# 11. Drying reserve — unauthenticated
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -d '{}')
assert_status "POST drying/reserve (no auth)" "401" "$code"

# 12. Dev third-party token (may be 404 in production)
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test")
if [ "$code" = "200" ] || [ "$code" = "404" ]; then
  echo "  OK  GET /api/dev/third-party-token ($code)"
  PASS=$((PASS + 1))
else
  echo "  FAIL GET /api/dev/third-party-token (expected 200 or 404, got $code)"
  FAIL=$((FAIL + 1))
fi

rm -f "$COOKIE_JAR" "$ADMIN_JAR"
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
