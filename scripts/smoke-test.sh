#!/usr/bin/env bash
# API smoke tests — requires dev server at localhost:3000
set -euo pipefail
BASE="http://localhost:3000"
PASS=0
FAIL=0

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expected, got $actual) $body"
    FAIL=$((FAIL + 1))
  fi
}

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "GET /" "200" "$code"

# 2. Mobile home
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
assert_status "GET /m" "200" "$code"

# 3. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "GET /admin/login" "200" "$code"

# 4. Admin dashboard redirect (no auth)
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
assert_status "GET /admin (no auth)" "307" "$code"

# 5. User login
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/login" "200" "$code"

# Save user cookie
USER_COOKIE=$(curl -s -c - -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' | grep sishi_user_session | awk '{print $6"="$7}')

# 6. Admin login
ADMIN_COOKIE=$(curl -s -c - -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' | grep sishi_admin_session | awk '{print $6"="$7}')
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_status "POST /api/auth/admin/login" "200" "$code"

# 7. Duplicate register returns 409
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_status "POST /api/auth/register (duplicate)" "409" "$code"

# 8. Third-party token (dev)
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test123")
assert_status "GET /api/dev/third-party-token" "200" "$code"

# 9. Protected API without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/clxxxxxxxxxxxxxxxxxxxxxxxxx/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":1000}')
assert_status "POST bid (no auth)" "401" "$code"

# 10. Get project ID from auction list page (via prisma)
SMOKE_DATA=$(cd /workspace && npx tsx scripts/smoke-data.ts 2>/dev/null)
PROJECT_ID=$(echo "$SMOKE_DATA" | head -1)

if [ -n "$PROJECT_ID" ]; then
  PID=$(echo "$PROJECT_ID" | awk '{print $1}')
  MIN_BID=$(echo "$PROJECT_ID" | awk '{print $2}')

  # 11. Place bid
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" \
    -H "Cookie: $USER_COOKIE" \
    -d "{\"amount\": $MIN_BID}")
  assert_status "POST bid (valid)" "200" "$code"

  # 12. Bid too low
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" \
    -H "Cookie: $USER_COOKIE" \
    -d '{"amount": 1}')
  assert_status "POST bid (too low)" "400" "$code"
else
  echo "SKIP: bid tests (no LIVE project)"
fi

# 13. Upload without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
assert_status "POST /api/upload (no auth)" "401" "$code"

# 14. Upload non-multipart (with auth)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Cookie: $ADMIN_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{}')
assert_status "POST /api/upload (non-multipart)" "400" "$code"

# 15. Admin assets non-multipart
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Cookie: $ADMIN_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{}')
assert_status "POST /api/admin/assets (non-multipart)" "400" "$code"

# 16. Drying reserve - get listing ID
LISTING_ID=$(echo "$SMOKE_DATA" | grep '^LISTING:' | cut -d: -f2)

if [ -n "$LISTING_ID" ]; then
  # 17. Drying reserve without auth
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-03\"}")
  assert_status "POST drying/reserve (no auth)" "401" "$code"

  # 18. Drying reserve with auth
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -H "Cookie: $USER_COOKIE" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-03\"}")
  assert_status "POST drying/reserve (valid)" "200" "$code"
else
  echo "SKIP: drying tests (no listing)"
fi

# 19. Mock payment without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/payments/mock" \
  -H "Content-Type: application/json" \
  -d '{"purpose":"DRYING_DEPOSIT"}')
assert_status "POST payments/mock (no auth)" "401" "$code"

# 20. Favicon
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/favicon.svg")
assert_status "GET /favicon.svg" "200" "$code"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
