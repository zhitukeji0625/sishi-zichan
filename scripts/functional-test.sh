#!/usr/bin/env bash
# 功能冒烟测试：需已启动 MariaDB、db push/seed、npm run dev
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/ft_user_cookies.txt"
ADMIN_JAR="/tmp/ft_admin_cookies.txt"
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; }

check_status() {
  local label="$1" url="$2" expect="${3:-200}" extra="${4:-}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" $extra "$url")
  if [ "$code" = "$expect" ]; then pass "$label ($code)"; else fail "$label (expected $expect, got $code)"; fi
}

check_json() {
  local label="$1" method="$2" url="$3" data="$4" expect_field="$5" jar="${6:-}"
  local resp
  if [ -n "$jar" ]; then
    resp=$(curl -s -X "$method" "$url" -H "Content-Type: application/json" -b "$jar" -c "$jar" -d "$data")
  else
    resp=$(curl -s -X "$method" "$url" -H "Content-Type: application/json" -d "$data")
  fi
  if echo "$resp" | grep -q "$expect_field"; then
    pass "$label"
  else
    fail "$label (got: $resp)"
  fi
}

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

echo "=== 四师资产租赁 功能冒烟测试 ==="
echo "Base: $BASE"
echo ""

echo "[1] 公开页面"
check_status "门户首页" "$BASE/"
check_status "H5 首页" "$BASE/m"
check_status "管理登录页" "$BASE/admin/login"
check_status "favicon 重定向" "$BASE/favicon.ico" "307"
check_status "应用图标" "$BASE/icon"

echo "[2] 用户认证"
check_json "用户登录" POST "$BASE/api/auth/login" '{"phone":"13800138000","password":"user123"}' '"ok":true' "$COOKIE_JAR"
check_status "用户中心" "$BASE/m/me" 200 "-b $COOKIE_JAR"
check_status "竞拍列表" "$BASE/m/auction" 200 "-b $COOKIE_JAR"
check_status "晒场列表" "$BASE/m/drying" 200 "-b $COOKIE_JAR"
check_status "订单列表" "$BASE/m/orders" 200 "-b $COOKIE_JAR"

echo "[3] 管理员认证"
check_json "管理员登录" POST "$BASE/api/auth/admin/login" '{"phone":"13900000001","password":"admin123"}' '"ok":true' "$ADMIN_JAR"
for path in /admin /admin/assets /admin/auctions /admin/drying /admin/organizations /admin/admins /admin/announcements /admin/registrations /admin/audit /admin/config /admin/dict; do
  check_status "管理页 $path" "$BASE$path" 200 "-b $ADMIN_JAR"
done

echo "[4] API 边界"
# 无 multipart 应返回 400 而非 500
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" -b "$ADMIN_JAR")
if [ "$code" = "400" ]; then pass "upload 无 body 返回 400"; else fail "upload 无 body (got $code)"; fi
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" -b "$ADMIN_JAR" -H "Content-Type: application/json" -d '{}')
if [ "$code" = "400" ]; then pass "admin assets 无 multipart 返回 400"; else fail "admin assets 无 multipart (got $code)"; fi

echo "[5] 第三方登录"
TOKEN=$(curl -sf "$BASE/api/dev/third-party-token?u_id=ft_test_user" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
check_json "第三方 SSO" POST "$BASE/api/auth/third-party" "{\"token\":\"$TOKEN\"}" '"ok":true'

echo "[6] 业务流"
# 确保有 LIVE 竞拍
npm run db:seed --silent 2>/dev/null || true
PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT id FROM AuctionProject WHERE status='LIVE' LIMIT 1;" 2>/dev/null || echo "")
LISTING_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT id FROM DryingFieldListing WHERE status='OPERATING' LIMIT 1;" 2>/dev/null || echo "")

if [ -n "$PROJECT_ID" ]; then
  check_status "竞拍详情" "$BASE/m/auction/$PROJECT_ID" 200 "-b $COOKIE_JAR"
  BID=$(curl -s -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H "Content-Type: application/json" -b "$COOKIE_JAR" -d '{"amount":999999}')
  if echo "$BID" | grep -qE '"ok":true|"出价需不低于'; then pass "出价 API"; else fail "出价 API ($BID)"; fi
else
  fail "无 LIVE 竞拍项目"
fi

if [ -n "$LISTING_ID" ]; then
  check_status "晒场详情" "$BASE/m/drying/$LISTING_ID" 200 "-b $COOKIE_JAR"
  START=$(date -d "+3 day" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+4 day" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  RESERVE=$(curl -s -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -b "$COOKIE_JAR" -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  if echo "$RESERVE" | grep -qE '"ok":true|"已满"'; then pass "晒场预约 API"; else fail "晒场预约 API ($RESERVE)"; fi
else
  fail "无运营中晒场"
fi

echo "[7] 登出"
check_status "用户登出" "$BASE/api/auth/logout" 200 "-b $COOKIE_JAR -X POST"
check_status "管理员登出" "$BASE/api/auth/admin/logout" 200 "-b $ADMIN_JAR -X POST"

echo ""
echo "=== 结果: $PASS 通过, $FAIL 失败 ==="
if [ "$FAIL" -gt 0 ]; then exit 1; fi
