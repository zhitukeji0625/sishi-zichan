#!/usr/bin/env bash
# API smoke tests — run against `npm run dev` on localhost:3000
set -euo pipefail
BASE="http://localhost:3000"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke Test: $BASE ==="

# 1. Public pages
check "Homepage" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "Admin login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "Mobile home" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"

# 2. Admin auth
ADMIN_RESP=$(curl -s -c /tmp/smoke_admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$ADMIN_RESP" | grep -q '"ok":true' && check "Admin login API" "ok" "ok" || check "Admin login API" "ok" "fail"

# 3. User auth
USER_RESP=$(curl -s -c /tmp/smoke_user.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$USER_RESP" | grep -q '"ok":true' && check "User login API" "ok" "ok" || check "User login API" "ok" "fail"

# 4. Protected admin pages
check "Admin dashboard" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke_admin.txt "$BASE/admin")"
check "Admin assets" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke_admin.txt "$BASE/admin/assets")"

# 5. Protected mobile pages
check "Mobile me" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke_user.txt "$BASE/m/me")"
check "Mobile auction" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke_user.txt "$BASE/m/auction")"

# 6. Third-party token (dev only)
check "Third-party token" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=smoke")"

# 7. Unauthenticated admin redirect
check "Admin no-auth redirect" "307" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")"

# 8. API auth guard
check "Bid API no-auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/fake/bid" -H 'Content-Type: application/json' -d '{"amount":100}')"

# 9. Multipart validation (should be 400, not 500)
check "Upload non-multipart" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke_admin.txt -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')"
check "Asset create non-multipart" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/smoke_admin.txt -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{}')"

# 10. Favicon
check "Favicon" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/favicon.svg")"

# 11. Registration
RAND_PHONE="199$(printf '%08d' $((RANDOM * 1000 + RANDOM)))"
REG_RESP=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$RAND_PHONE\",\"password\":\"test1234\"}")
echo "$REG_RESP" | grep -q '"ok":true' && check "User register API" "ok" "ok" || check "User register API" "ok" "fail"

# 12. Logout
LOGOUT=$(curl -s -b /tmp/smoke_user.txt -X POST "$BASE/api/auth/logout")
echo "$LOGOUT" | grep -q '"ok":true' && check "User logout API" "ok" "ok" || check "User logout API" "ok" "fail"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
