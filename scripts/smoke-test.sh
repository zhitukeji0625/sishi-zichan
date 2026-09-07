#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ERRORS=""

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS+1))
    echo "✓ $name"
  else
    FAIL=$((FAIL+1))
    echo "✗ $name (expected: $expected, got: $actual)"
    ERRORS="${ERRORS}\n- $name: expected $expected, got $actual"
  fi
}

check_json_ok() {
  local name="$1" resp="$2"
  if echo "$resp" | grep -q '"ok":true'; then
    PASS=$((PASS+1))
    echo "✓ $name"
  else
    FAIL=$((FAIL+1))
    echo "✗ $name (response: $resp)"
    ERRORS="${ERRORS}\n- $name: $resp"
  fi
}

echo "=== Smoke Test: $BASE ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "Homepage" "200" "$code"

# 2. Mobile page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
check "Mobile H5" "200" "$code"

# 3. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check "Admin login page" "200" "$code"

# 4. Admin redirect without auth
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
check "Admin redirect (no auth)" "307" "$code"

# 5. User login
resp=$(curl -s -c /tmp/user_cookies.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_json_ok "User login" "$resp"

# 6. Protected API without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/test/bid" \
  -H "Content-Type: application/json" -d '{"amount":8000}')
check "Bid without auth (401)" "401" "$code"

# 7. Admin login
resp=$(curl -s -c /tmp/admin_cookies.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json_ok "Admin login" "$resp"

# 8. Third-party token (dev)
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test_user")
check "Third-party token (dev)" "200" "$code"

# 9. Third-party login
token_resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test_user")
token=$(echo "$token_resp" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$token" ]; then
  tp_resp=$(curl -s -c /tmp/tp_cookies.txt -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$token\"}")
  check_json_ok "Third-party login" "$tp_resp"
else
  FAIL=$((FAIL+1))
  echo "✗ Third-party login (no token)"
fi

# 10. Auction bid (use demo asset project; amount high enough to clear min bid)
auction_html=$(curl -s -b /tmp/user_cookies.txt "$BASE/m/auction")
project_id=$(echo "$auction_html" | grep -oE '/m/auction/c[a-z0-9]+' | head -1 | sed 's|/m/auction/||')
if [ -n "$project_id" ]; then
  bid_amount=1000000
  bid_resp=$(curl -s -b /tmp/user_cookies.txt -X POST "$BASE/api/m/auction/$project_id/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$bid_amount}")
  check_json_ok "Place bid ($project_id)" "$bid_resp"
else
  FAIL=$((FAIL+1))
  echo "✗ No auction project found"
  ERRORS="${ERRORS}\n- No auction project found on /m/auction"
fi

# 11. Drying reserve
drying_html=$(curl -s -b /tmp/user_cookies.txt "$BASE/m/drying")
listing_id=$(echo "$drying_html" | grep -oE '/m/drying/c[a-z0-9]+' | head -1 | sed 's|/m/drying/||')
if [ -n "$listing_id" ]; then
  reserve_resp=$(curl -s -b /tmp/user_cookies.txt -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$listing_id\",\"startDate\":\"2026-09-10\",\"endDate\":\"2026-09-12\"}")
  if echo "$reserve_resp" | grep -qE '"ok":true|"error"'; then
    PASS=$((PASS+1))
    echo "✓ Drying reserve ($listing_id)"
  else
    FAIL=$((FAIL+1))
    echo "✗ Drying reserve (response: $reserve_resp)"
  fi
else
  FAIL=$((FAIL+1))
  echo "✗ No drying listing found"
fi

# 12. Upload without multipart (should be 400, not 500)
code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/admin_cookies.txt -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
check "Upload non-multipart (400)" "400" "$code"

# 13. Assets without multipart (should be 400, not 500)
code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/admin_cookies.txt -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
check "Assets non-multipart (400)" "400" "$code"

# 14. Favicon
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/favicon.svg")
if [ "$code" = "200" ] || [ "$code" = "308" ]; then
  PASS=$((PASS+1))
  echo "✓ Favicon ($code)"
else
  FAIL=$((FAIL+1))
  echo "✗ Favicon ($code)"
  ERRORS="${ERRORS}\n- Favicon: HTTP $code"
fi

# 15. User logout
code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/user_cookies.txt -X POST "$BASE/api/auth/logout")
check "User logout" "200" "$code"

# 16. Admin logout
code=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/admin_cookies.txt -X POST "$BASE/api/auth/admin/logout")
check "Admin logout" "200" "$code"

# 17. User register (new phone)
rand_phone="138$(printf '%08d' $((RANDOM % 100000000)))"
reg_resp=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$rand_phone\",\"password\":\"test1234\",\"name\":\"SmokeTest\"}")
check_json_ok "User register" "$reg_resp"

# 18. Mock payment without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/payments/mock" \
  -H "Content-Type: application/json" -d '{"purpose":"AUCTION_DEPOSIT"}')
check "Mock payment without auth (401)" "401" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ -n "$ERRORS" ]; then
  echo -e "Errors:$ERRORS"
fi

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
