#!/usr/bin/env bash
# Functional smoke test for sishi-zichan (run with dev server on :3000)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  OK  $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test @ $BASE ==="

# 1. Public pages
for path in "/" "/m" "/m/login" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "$path" "200" "$code"
done

# 2. Admin login + dashboard
ADMIN_JSON=$(curl -s -c /tmp/smoke_admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$ADMIN_JSON" | grep -q '"ok":true' && check "admin login" "ok" "ok" || check "admin login" "ok" "fail"
code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/smoke_admin.txt "$BASE/admin/assets")
check "/admin/assets" "200" "$code"

# 3. User login
USER_JSON=$(curl -s -c /tmp/smoke_user.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$USER_JSON" | grep -q '"ok":true' && check "user login" "ok" "ok" || check "user login" "ok" "fail"

# 4. Dict categories exist (grep admin dict page)
DICT_HTML=$(curl -s -b /tmp/smoke_admin.txt "$BASE/admin/dict")
echo "$DICT_HTML" | grep -q 'asset_type' && check "dict seeded" "ok" "ok" || check "dict seeded" "ok" "fail"

# 5. Auction bid (project must be LIVE — run db:seed first)
PROJECT_ID=$(curl -s -b /tmp/smoke_user.txt "$BASE/m/auction" | grep -oP 'href="/m/auction/[^"]+' | head -1 | sed 's|href="/m/auction/||' || true)
if [ -n "${PROJECT_ID:-}" ]; then
  BID=$(curl -s -b /tmp/smoke_user.txt -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":8400}')
  echo "$BID" | grep -q '"ok":true' && check "auction bid" "ok" "ok" || check "auction bid" "ok" "fail ($BID)"
else
  check "auction list has project" "ok" "fail"
fi

# 6. Third-party token
TOKEN_JSON=$(curl -s "$BASE/api/dev/third-party-token?u_id=13800138000")
echo "$TOKEN_JSON" | grep -q '"token"' && check "third-party token" "ok" "ok" || check "third-party token" "ok" "fail"

# 7. SSO page
TOKEN=$(echo "$TOKEN_JSON" | grep -oP '"token":"[^"]+' | cut -d'"' -f4)
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
check "/m/sso" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
