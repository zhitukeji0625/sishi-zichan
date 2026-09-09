#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/smoke-admin-cookies.txt"
USER_JAR="/tmp/smoke-user-cookies.txt"
rm -f "$COOKIE_JAR" "$USER_JAR"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

# 1-3. Static pages
check "GET /" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /admin/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

# 4. Admin login
code=$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check "POST /api/auth/admin/login" "200" "$code"

# 5. Admin dashboard
check "GET /admin (authenticated)" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/admin")"

# 6-7. Non-multipart should return 400
check "POST /api/admin/assets (non-multipart)" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"test"}')"
check "POST /api/upload (non-multipart)" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"file":"test"}')"

# 8. User login
check "POST /api/auth/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')"

# 9-11. Auction pages
check "GET /m/auction" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
html=$(curl -s "$BASE/m/auction")
project_id=$(echo "$html" | grep -oE 'c[a-z0-9]{20,}' | head -1)
if [ -n "$project_id" ]; then
  echo "✓ Found auction project ID: $project_id"
  PASS=$((PASS + 1))
  check "GET /m/auction/[id]" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction/$project_id")"
else
  echo "✗ No auction project ID found in /m/auction"
  FAIL=$((FAIL + 1))
fi

# 12. Bid without auth
if [ -n "$project_id" ]; then
  check "POST bid (no auth)" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/$project_id/bid" \
    -H "Content-Type: application/json" -d '{"amount":1000}')"
fi

# 13-15. Drying
check "GET /m/drying" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"
listing_id=$(curl -s "$BASE/m/drying" | grep -oE 'c[a-z0-9]{20,}' | head -1)
if [ -n "$listing_id" ]; then
  echo "✓ Found drying listing ID: $listing_id"
  PASS=$((PASS + 1))
  start_date=$(date -d "+5 days" +%Y-%m-%d 2>/dev/null || date -v+5d +%Y-%m-%d)
  end_date=$(date -d "+6 days" +%Y-%m-%d 2>/dev/null || date -v+6d +%Y-%m-%d)
  check "POST drying/reserve (no auth)" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$listing_id\",\"startDate\":\"$start_date\",\"endDate\":\"$end_date\"}")"
else
  echo "✗ No drying listing ID found"
  FAIL=$((FAIL + 1))
fi

# 16. Dev third-party token
check "GET /api/dev/third-party-token" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=testuser")"

# 17. Register
phone="199$(date +%s | tail -c 9)"
check "POST /api/auth/register" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" -d "{\"phone\":\"$phone\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")"

# 18. Wrong admin password
check "POST admin login (wrong password)" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"wrong"}')"

# 19. Authenticated bid (demo auction should be LIVE after layout refresh)
if [ -n "$project_id" ]; then
  # Trigger layout refresh to renew demo auction
  curl -s -o /dev/null "$BASE/"
  bid_body=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$project_id/bid" \
    -H "Content-Type: application/json" -d '{"amount":999999}')
  bid_code=$(echo "$bid_body" | grep -q '"ok":true' && echo "200" || echo "400")
  # Accept 200 (success) — amount may vary; re-fetch with dynamic min
  if echo "$bid_body" | grep -q '"ok":true'; then
    echo "✓ POST bid (authenticated) (200)"
    PASS=$((PASS + 1))
  else
    # Try computing min bid from error or use a high amount after refresh
    resp=$(curl -s -w '\n%{http_code}' -b "$USER_JAR" -X POST "$BASE/api/m/auction/$project_id/bid" \
      -H "Content-Type: application/json" -d '{"amount":10000}')
    code=$(echo "$resp" | tail -1)
    body=$(echo "$resp" | head -n -1)
    if [ "$code" = "200" ] || echo "$body" | grep -q '"ok":true'; then
      echo "✓ POST bid (authenticated) (200)"
      PASS=$((PASS + 1))
    else
      echo "✗ POST bid (authenticated) failed: $body"
      FAIL=$((FAIL + 1))
    fi
  fi
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit "$FAIL"
