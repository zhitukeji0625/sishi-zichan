#!/usr/bin/env bash
# API & page smoke tests — requires dev server on http://localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ADMIN_COOKIE="/tmp/smoke_admin_cookies.txt"
USER_COOKIE="/tmp/smoke_user_cookies.txt"
rm -f "$ADMIN_COOKIE" "$USER_COOKIE"

check() {
  local name="$1" expect="$2" actual="$3"
  if [ "$actual" = "$expect" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name expected=$expect actual=$actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test against $BASE ==="

# Trigger auction status refresh + demo renewal
curl -s "$BASE/m/auction" > /dev/null

# Public pages
check "GET /" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")"
check "GET /m" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")"
check "GET /m/login" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")"
check "GET /m/register" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/register")"
check "GET /m/auction" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")"
check "GET /m/drying" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")"

# Auth validation
check "POST /api/auth/login empty" 400 "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "{}")"
check "POST /api/auth/admin/login empty" 400 "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d "{}")"

# Protected APIs without auth
check "POST bid no auth" 401 "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/test/bid" -H "Content-Type: application/json" -d '{"amount":100}')"
check "POST drying reserve no auth" 401 "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d "{}")"
check "POST upload no auth" 401 "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")"

# Admin login
check "POST admin login" 200 "$(curl -s -o /dev/null -w "%{http_code}" -c "$ADMIN_COOKIE" -b "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')"

# Non-multipart with auth
check "POST /api/upload non-multipart" 400 "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d "{}")"
check "POST /api/admin/assets non-multipart" 400 "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d "{}")"

# User login
check "POST user login" 200 "$(curl -s -o /dev/null -w "%{http_code}" -c "$USER_COOKIE" -b "$USER_COOKIE" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')"

# Admin pages
check "GET /admin" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin")"
check "GET /admin/assets" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin/assets")"
check "GET /admin/auctions" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin/auctions")"
check "GET /admin/drying" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin/drying")"
check "GET /admin/organizations" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin/organizations")"
check "GET /admin/audit" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE/admin/audit")"

# User pages
check "GET /m/me" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" "$BASE/m/me")"
check "GET /m/orders" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" "$BASE/m/orders")"

# Auction detail + bid
AUCTION_HTML=$(curl -s -b "$USER_COOKIE" "$BASE/m/auction")
PROJECT_ID=$(echo "$AUCTION_HTML" | grep -oE 'c[a-z0-9]{20,}' | head -1)
if [ -z "$PROJECT_ID" ]; then
  echo "FAIL: no auction project id found in /m/auction"
  FAIL=$((FAIL + 1))
else
  check "GET auction detail" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" "$BASE/m/auction/$PROJECT_ID")"
  ROWS=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
    "SELECT startPrice, bidStep, COALESCE((SELECT MAX(amount) FROM AuctionBid WHERE projectId='$PROJECT_ID'),0), status FROM AuctionProject WHERE id='$PROJECT_ID'" 2>/dev/null || echo "")
  if [ -n "$ROWS" ]; then
    START=$(echo "$ROWS" | awk '{print $1}')
    STEP=$(echo "$ROWS" | awk '{print $2}')
    HIGHEST=$(echo "$ROWS" | awk '{print $3}')
    STATUS=$(echo "$ROWS" | awk '{print $4}')
    MIN_BID=$(python3 -c "print(max(float('$START'), float('$HIGHEST')) + float('$STEP'))")
    BID_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
    check "POST bid (status=$STATUS)" 200 "$BID_CODE"
  else
    echo "FAIL: could not query auction project from DB"
    FAIL=$((FAIL + 1))
  fi
fi

# Drying reservation
LISTING_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
  "SELECT id FROM DryingFieldListing WHERE status='OPERATING' LIMIT 1" 2>/dev/null || echo "")
if [ -n "$LISTING_ID" ]; then
  check "GET drying detail" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" "$BASE/m/drying/$LISTING_ID")"
  START_DATE=$(date -u -d "+2 days" +%Y-%m-%d)
  END_DATE=$(date -u -d "+3 days" +%Y-%m-%d)
  RES_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  check "POST drying reserve" 200 "$RES_CODE"
else
  echo "FAIL: no operating drying listing"
  FAIL=$((FAIL + 1))
fi

# Register new user
PHONE="199$(date +%s | tail -c 9)"
REG_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
check "POST register" 200 "$REG_CODE"

# Dev third-party token
check "GET dev token" 200 "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")"

# Logout
check "POST admin logout" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/logout")"
check "POST user logout" 200 "$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/auth/logout")"

echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ]
