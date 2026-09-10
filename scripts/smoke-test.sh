#!/usr/bin/env bash
# API smoke test — must run against `npm run dev` (not production build)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
PASS=0
FAIL=0

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
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
    echo "  ✗ $name — $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test @ $BASE ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "GET /" "200" "$code"

# 2. Mobile H5
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
assert_status "GET /m" "200" "$code"

# 3. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "GET /admin/login" "200" "$code"

# 4. Admin login — wrong password
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"wrong"}')
assert_status "POST admin/login wrong pwd" "401" "$code"

# 5. Admin login — success
body=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "POST admin/login" "$body"

# 6. Upload without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
assert_status "POST /api/upload no auth" "401" "$code"

# 7. Upload non-multipart (should be 400, not 500)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -b "$ADMIN_JAR" -H "Content-Type: application/json" -d '{}')
assert_status "POST /api/upload non-multipart" "400" "$code"

# 8. Admin assets non-multipart
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -b "$ADMIN_JAR" -H "Content-Type: application/json" -d '{}')
assert_status "POST /api/admin/assets non-multipart" "400" "$code"

# 9. User login
body=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "POST user/login" "$body"

# 10. User login wrong password
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
assert_status "POST user/login wrong pwd" "401" "$code"

# 11. Register new user
PHONE="199$(date +%s | tail -c 9)"
body=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
assert_json_ok "POST register" "$body"

# 12. Register duplicate
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\"}")
assert_status "POST register duplicate" "409" "$code"

# 13. Third-party token (dev)
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-user")
assert_status "GET third-party-token" "200" "$code"

# 14. Bid without login
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_ID=$(node "$ROOT/scripts/smoke-db.mjs" project-id 2>/dev/null)

if [ -n "$PROJECT_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":99999}')
  assert_status "POST bid no auth" "401" "$code"

  # Ensure project is LIVE
  node "$ROOT/scripts/smoke-db.mjs" ensure-live "$PROJECT_ID" 2>/dev/null

  # Get current max bid + bidStep for minimum bid
  MIN_BID=$(node "$ROOT/scripts/smoke-db.mjs" min-bid "$PROJECT_ID" 2>/dev/null)

  body=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  assert_json_ok "POST bid" "$body"
else
  echo "  ✗ No auction project found"
  FAIL=$((FAIL + 1))
fi

# 15. Drying reserve
LISTING_ID=$(node "$ROOT/scripts/smoke-db.mjs" listing-id 2>/dev/null)

if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+2 days" +%Y-%m-%d 2>/dev/null || date -v+2d +%Y-%m-%d)
  END=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  body=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  assert_json_ok "POST drying reserve" "$body"

  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d '{"listingId":"invalid","startDate":"2026-01-01","endDate":"2026-01-02"}')
  assert_status "POST drying reserve no auth" "401" "$code"
else
  echo "  ✗ No drying listing found"
  FAIL=$((FAIL + 1))
fi

# 16. Admin logout
body=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
assert_json_ok "POST admin/logout" "$body"

# 17. User logout
body=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
assert_json_ok "POST user/logout" "$body"

# 18. Invalid register params
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" -d '{"phone":"123","password":"x"}')
assert_status "POST register invalid" "400" "$code"

# 19. Admin pages (should redirect or 200)
code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/admin")
assert_status "GET /admin" "200" "$code"

# 20. Auction mobile page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")
assert_status "GET /m/auction" "200" "$code"

# 21. Drying mobile page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying")
assert_status "GET /m/drying" "200" "$code"

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
