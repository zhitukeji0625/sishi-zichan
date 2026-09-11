#!/usr/bin/env bash
# API smoke tests for sishi-zichan (requires dev server on :3000)
set -euo pipefail
BASE="http://localhost:3000"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke Test: sishi-zichan ==="

# 1. Portal homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "Portal homepage" "200" "$code"

# 2. H5 homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
assert_status "H5 homepage" "200" "$code"

# 3. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "Admin login page" "200" "$code"

# 4. Admin login API - wrong password
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"wrong"}')
assert_status "Admin login wrong password" "401" "$code"

# 5. Admin login API - success
body=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "Admin login success" "$body"

# 6. Admin dashboard (cookie protected)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
assert_status "Admin dashboard" "200" "$code"

# 7. Upload without multipart → 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
assert_status "Upload non-multipart" "400" "$code"

# 8. Admin assets without multipart → 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
assert_status "Admin assets non-multipart" "400" "$code"

# 9. User login
body=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "User login" "$body"

# 10. Bid without auth → 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
assert_status "Bid without auth" "401" "$code"

# 11. Drying reserve without auth → 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"x","startDate":"2026-01-01","endDate":"2026-01-02"}')
assert_status "Drying reserve without auth" "401" "$code"

# 12. User register
PHONE="199$(date +%s | tail -c 9)"
body=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
assert_json_ok "User register" "$body"

# 13. Dev third-party token
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test123")
assert_status "Dev third-party token" "200" "$code"

# 14. Auction page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/auction")
assert_status "Auction list page" "200" "$code"

# 15. Drying page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/drying")
assert_status "Drying list page" "200" "$code"

# 16. Bid on LIVE project (from DB)
PROJECT_ID=$(cd /workspace && npx tsx scripts/db-query.ts live-auction 2>/dev/null | tail -1)

if [[ -n "$PROJECT_ID" ]]; then
  PID=$(echo "$PROJECT_ID" | awk '{print $1}')
  AMT=$(echo "$PROJECT_ID" | awk '{print $2}')
  # Login as demo user who has approved registration
  curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"phone":"13800138000","password":"user123"}' > /dev/null
  body=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$AMT}")
  assert_json_ok "Place bid on LIVE project" "$body"
else
  echo "  ⚠ Skip bid test: no LIVE project"
fi

# 17. Drying reserve with dynamic dates
LISTING_ID=$(cd /workspace && npx tsx scripts/db-query.ts operating-listing 2>/dev/null | tail -1)

if [[ -n "$LISTING_ID" ]]; then
  START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  body=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  assert_json_ok "Drying reserve" "$body"
else
  echo "  ⚠ Skip drying reserve: no OPERATING listing"
fi

# 18. Mock payment invalid params → 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/payments/mock" \
  -H "Content-Type: application/json" -d '{}')
assert_status "Mock payment invalid params" "400" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
