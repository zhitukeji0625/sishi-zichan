#!/usr/bin/env bash
# End-to-end smoke tests for sishi-zichan
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="$(mktemp)"
ADMIN_JAR="$(mktemp)"
PASS=0
FAIL=0

cleanup() { rm -f "$COOKIE_JAR" "$ADMIN_JAR"; }
trap cleanup EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests @ $BASE ==="

# 1. Public pages
for path in "/" "/m" "/m/login" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

# 2. Dev third-party token
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-user-1")
assert_status "GET /api/dev/third-party-token" "200" "$code"

# 3. Admin login
admin_body=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "Admin login" "$admin_body"

# 4. Admin dashboard (cookie protected)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
assert_status "GET /admin (authenticated)" "200" "$code"

# 5. Admin assets page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/assets")
assert_status "GET /admin/assets (authenticated)" "200" "$code"

# 6. User login
user_body=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "User login" "$user_body"

# 7. Mobile pages (authenticated)
for path in "/m/auction" "/m/drying" "/m/me" "/m/orders"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  assert_status "GET $path (user)" "200" "$code"
done

# 8. Auction bid (dynamic min amount from DB)
BID_INFO=$(cd "$(dirname "$0")/.." && npx tsx scripts/smoke-bid-info.ts 2>/dev/null || true)
PROJECT_ID=$(echo "$BID_INFO" | head -1)
MIN_BID=$(echo "$BID_INFO" | tail -1)
if [[ -n "$PROJECT_ID" && -n "$MIN_BID" ]]; then
  bid_body=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  if echo "$bid_body" | grep -qE '"ok":true|"id"'; then
    echo "✓ Auction bid ($MIN_BID)"
    PASS=$((PASS + 1))
  else
    echo "✗ Auction bid: $bid_body"
    FAIL=$((FAIL + 1))
  fi
else
  echo "✗ Could not resolve live auction for bid test"
  FAIL=$((FAIL + 1))
fi

# 9. Dict labels (check Chinese labels exist)
DICT_CHECK=$(cd "$(dirname "$0")/.." && npx tsx scripts/smoke-dict-check.ts 2>/dev/null || echo "FAIL")
if [[ "$DICT_CHECK" == "OK" ]]; then
  echo "✓ Dict categories populated"
  PASS=$((PASS + 1))
else
  echo "✗ Dict categories: $DICT_CHECK"
  FAIL=$((FAIL + 1))
fi

# 10. Logout
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
assert_status "POST /api/auth/logout" "200" "$code"

echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
