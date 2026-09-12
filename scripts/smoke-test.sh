#!/usr/bin/env bash
# API 冒烟测试 — 须在 dev 模式 (npm run dev) 下运行
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_DIR=$(mktemp -d)
ADMIN_COOKIE="$COOKIE_DIR/admin.txt"
USER_COOKIE="$COOKIE_DIR/user.txt"

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

check_body() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -q "$pattern"; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (pattern '$pattern' not found)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test: $BASE ==="

# Pages
for path in / /admin/login /m /m/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# Admin login
body=$(curl -s -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' \
  -c "$ADMIN_COOKIE")
check_body "Admin login" '"ok":true' "$body"

# User login
body=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' \
  -c "$USER_COOKIE")
check_body "User login" '"ok":true' "$body"

# Protected admin pages
for path in /admin /admin/assets /admin/auctions; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path" -b "$ADMIN_COOKIE")
  check "GET $path (admin)" "200" "$code"
done

# Protected user pages
for path in /m/auction /m/drying /m/me; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path" -b "$USER_COOKIE")
  check "GET $path (user)" "200" "$code"
done

# Third-party SSO
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
body=$(curl -s -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
check_body "Third-party SSO" '"ok":true' "$body"

# Non-multipart should return 400 (not 500)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}' -b "$ADMIN_COOKIE")
check "Upload non-multipart → 400" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"x"}' -b "$ADMIN_COOKIE")
check "Asset non-multipart → 400" "400" "$code"

# Unauthenticated API
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
check "Bid without auth → 401" "401" "$code"

# Register
PHONE="199$(date +%s | tail -c 9)"
body=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
check_body "User register" '"ok":true' "$body"

# Drying reserve
LISTING_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT id FROM DryingFieldListing LIMIT 1" 2>/dev/null || echo "")
if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  body=$(curl -s -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}" \
    -b "$USER_COOKIE")
  check_body "Drying reserve" '"ok":true' "$body"
fi

# Bid on LIVE project
PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
  "SELECT id FROM AuctionProject WHERE status='LIVE' LIMIT 1" 2>/dev/null || echo "")
if [ -n "$PROJECT_ID" ]; then
  TOP=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
    "SELECT COALESCE(MAX(amount),0) FROM AuctionBid WHERE projectId='$PROJECT_ID'" 2>/dev/null || echo "0")
  STEP=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
    "SELECT bidStep FROM AuctionProject WHERE id='$PROJECT_ID'" 2>/dev/null || echo "100")
  START_P=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
    "SELECT startPrice FROM AuctionProject WHERE id='$PROJECT_ID'" 2>/dev/null || echo "1000")
  if [ "$TOP" = "0" ] || [ "$TOP" = "0.00" ]; then
    BID="$START_P"
  else
    BID=$(python3 -c "print(float('$TOP') + float('$STEP'))")
  fi
  body=$(curl -s -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$BID}" -b "$USER_COOKIE")
  check_body "Auction bid" '"ok":true' "$body"
fi

rm -rf "$COOKIE_DIR"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
