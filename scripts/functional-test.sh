#!/usr/bin/env bash
# Functional smoke tests — requires dev server at BASE_URL (default http://localhost:3000)
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
JAR_USER="/tmp/ft-user-cookies.txt"
JAR_ADMIN="/tmp/ft-admin-cookies.txt"
PASS=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then pass "$name"; else fail "$name: $body"; fi
}

echo "=== Functional smoke tests @ $BASE_URL ==="
rm -f "$JAR_USER" "$JAR_ADMIN"

# Health
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
assert_status "GET /" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/m")
assert_status "GET /m" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/m/auction")
assert_status "GET /m/auction" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/m/drying")
assert_status "GET /m/drying" "200" "$code"

# Auth
body=$(curl -s -c "$JAR_USER" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "POST /api/auth/login (user)" "$body"

body=$(curl -s -c "$JAR_ADMIN" -X POST "$BASE_URL/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "POST /api/auth/admin/login" "$body"

# Middleware
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":8000}')
assert_status "POST bid without cookie -> 401" "401" "$code"

# Wrong password
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')
assert_status "POST login wrong password -> 401" "401" "$code"

# Dev third-party token
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/dev/third-party-token?u_id=ft_test")
assert_status "GET /api/dev/third-party-token" "200" "$code"

token=$(curl -s "$BASE_URL/api/dev/third-party-token?u_id=ft_test" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -n "$token" ]; then
  body=$(curl -s -c "$JAR_USER" -X POST "$BASE_URL/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$token\"}")
  assert_json_ok "POST /api/auth/third-party" "$body"
else
  fail "third-party token extraction"
fi

# Admin pages (with cookie)
for path in /admin /admin/assets /admin/auctions /admin/registrations /admin/drying /admin/dict; do
  code=$(curl -s -b "$JAR_ADMIN" -o /dev/null -w "%{http_code}" "$BASE_URL$path")
  assert_status "GET $path" "200" "$code"
done

# Asset form should have type options (dict or fallback)
html=$(curl -s -b "$JAR_ADMIN" "$BASE_URL/admin/assets/new")
if echo "$html" | grep -q 'LAND'; then
  pass "admin/assets/new has asset type options"
else
  fail "admin/assets/new missing asset type options"
fi

# Auction bid — discover project id and min bid from DB if available
if command -v docker >/dev/null 2>&1; then
  DOCKER="docker"
  if ! docker ps >/dev/null 2>&1; then
    DOCKER="sudo docker"
  fi
fi

db_query() {
  [ -n "${DOCKER:-}" ] && $DOCKER exec mariadb mariadb -uroot -proot sishi -N -e "$1" 2>/dev/null || true
}

PROJECT_ID=$(db_query "SELECT id FROM AuctionProject WHERE status='LIVE' ORDER BY createdAt ASC LIMIT 1")
START_PRICE=$(db_query "SELECT startPrice FROM AuctionProject WHERE id='$PROJECT_ID'")
TOP_BID=$(db_query "SELECT COALESCE(MAX(amount),0) FROM AuctionBid WHERE projectId='$PROJECT_ID'")
BID_STEP=$(db_query "SELECT bidStep FROM AuctionProject WHERE id='$PROJECT_ID'")

if [ -n "$PROJECT_ID" ]; then
  # Re-login demo user (third-party may have switched session)
  curl -s -c "$JAR_USER" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"phone":"13800138000","password":"user123"}' >/dev/null

  if [ "$TOP_BID" = "0" ] || [ -z "$TOP_BID" ]; then
    AMOUNT="${START_PRICE:-8000}"
  else
    AMOUNT=$(python3 -c "print(int(float('$TOP_BID')) + int(float('${BID_STEP:-200}')))" 2>/dev/null || echo "8200")
  fi

  body=$(curl -s -b "$JAR_USER" -w "\n%{http_code}" -X POST "$BASE_URL/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$AMOUNT}")
  http_code=$(echo "$body" | tail -1)
  json=$(echo "$body" | sed '$d')
  if [ "$http_code" = "200" ] && echo "$json" | grep -q '"ok":true'; then
    pass "POST auction bid ($AMOUNT)"
  else
    fail "POST auction bid: $json (status $http_code)"
  fi
else
  fail "no LIVE auction project in DB"
fi

# Drying reserve
LISTING_ID=$(db_query "SELECT id FROM DryingFieldListing LIMIT 1")

if [ -n "$LISTING_ID" ]; then
  body=$(curl -s -b "$JAR_USER" -w "\n%{http_code}" -X POST "$BASE_URL/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-07-01\",\"endDate\":\"2026-07-03\"}")
  http_code=$(echo "$body" | tail -1)
  json=$(echo "$body" | sed '$d')
  if [ "$http_code" = "200" ] && echo "$json" | grep -q '"ok":true'; then
    pass "POST drying reserve"
  else
    fail "POST drying reserve: $json (status $http_code)"
  fi
else
  fail "no drying listing in DB"
fi

# Logout
body=$(curl -s -b "$JAR_USER" -X POST "$BASE_URL/api/auth/logout")
assert_json_ok "POST /api/auth/logout" "$body"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
