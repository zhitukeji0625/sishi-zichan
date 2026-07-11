#!/bin/bash
set -euo pipefail
BASE="http://localhost:3000"
ADMIN_COOKIE="/tmp/admin_cookies.txt"
USER_COOKIE="/tmp/user_cookies.txt"
FAIL=0

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; FAIL=1; }

check_status() {
  local name="$1" expected="$2" actual="$3" body="$4"
  if [ "$actual" = "$expected" ]; then
    pass "$name (HTTP $actual)"
  else
    fail "$name (expected HTTP $expected, got $actual): $body"
  fi
}

check_status_any() {
  local name="$1" actual="$2" body="$3"
  shift 3
  for exp in "$@"; do
    if [ "$actual" = "$exp" ]; then
      pass "$name (HTTP $actual)"
      return
    fi
  done
  fail "$name (expected one of: $*, got $actual): $body"
}

db_query() {
  sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "$1" 2>/dev/null
}

echo "=== 页面可达性 ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/m/me" "/admin/login" "/admin"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$path" = "/admin" ]; then
    check_status_any "GET $path" "$code" "" "200" "307"
  else
    check_status "GET $path" "200" "$code" ""
  fi
done

echo ""
echo "=== 管理端登录 ==="
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check_status "POST /api/auth/admin/login" "200" "$code" "$body"
echo "$body" | grep -q '"ok":true' && pass "admin login ok" || fail "admin login response: $body"

echo ""
echo "=== 管理端页面（需登录）==="
for path in "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/organizations" "/admin/announcements"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE$path")
  check_status "GET $path" "200" "$code" ""
done

echo ""
echo "=== 用户端登录 ==="
resp=$(curl -s -w "\n%{http_code}" -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check_status "POST /api/auth/login" "200" "$code" "$body"

echo ""
echo "=== 第三方登录 ==="
token_resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=sso_$(date +%s)")
token=$(echo "$token_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
if [ -n "$token" ]; then
  pass "GET /api/dev/third-party-token"
  resp=$(curl -s -w "\n%{http_code}" -c /tmp/sso_cookies.txt -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" -d "{\"token\":\"$token\"}")
  code=$(echo "$resp" | tail -n 1)
  check_status "POST /api/auth/third-party" "200" "$code" "$(echo "$resp" | head -n -1)"
else
  fail "GET /api/dev/third-party-token: $token_resp"
fi

echo ""
echo "=== 竞拍出价 ==="
PROJECT_ID=$(db_query "SELECT id FROM AuctionProject WHERE status='LIVE' ORDER BY createdAt DESC LIMIT 1;")

if [ -n "$PROJECT_ID" ]; then
  pass "found LIVE auction project: $PROJECT_ID"
  CURRENT=$(db_query "
    SELECT COALESCE(
      (SELECT amount + bidStep FROM AuctionBid b JOIN AuctionProject p ON b.projectId=p.id WHERE b.projectId='$PROJECT_ID' ORDER BY b.amount DESC LIMIT 1),
      (SELECT startPrice + bidStep FROM AuctionProject WHERE id='$PROJECT_ID')
    );
  ")
  resp=$(curl -s -w "\n%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$CURRENT}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check_status "POST /api/m/auction/$PROJECT_ID/bid" "200" "$code" "$body"
else
  fail "no LIVE auction project found"
fi

echo ""
echo "=== 晒场预约 ==="
LISTING_ID=$(db_query "SELECT id FROM DryingFieldListing WHERE status='OPERATING' LIMIT 1;")

if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+5 days" +%Y-%m-%d 2>/dev/null || date -v+5d +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  # 200 or 400 (capacity conflict) both acceptable for functional test
  if [ "$code" = "200" ] || [ "$code" = "400" ]; then
    pass "POST /api/m/drying/reserve (HTTP $code): $body"
  else
    fail "POST /api/m/drying/reserve (HTTP $code): $body"
  fi
else
  fail "no drying field listing found"
fi

echo ""
echo "=== 注册新用户 ==="
NEW_PHONE="199$(date +%s | tail -c 9)"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$NEW_PHONE\",\"password\":\"test1234\",\"name\":\"测试用户\"}")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check_status "POST /api/auth/register" "200" "$code" "$body"

echo ""
echo "=== 登出 ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/auth/logout")
check_status "POST /api/auth/logout" "200" "$code" ""
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/logout")
check_status "POST /api/auth/admin/logout" "200" "$code" ""

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "=== 全部测试通过 ==="
  exit 0
else
  echo "=== 存在失败项 ==="
  exit 1
fi
