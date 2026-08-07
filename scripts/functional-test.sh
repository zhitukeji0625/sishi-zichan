#!/bin/bash
set -euo pipefail
BASE="http://localhost:3000"
COOKIE_JAR="/tmp/test-cookies.txt"
ADMIN_JAR="/tmp/test-admin-cookies.txt"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name"
    PASS=$((PASS+1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

check_contains() {
  local name="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "✓ $name"
    PASS=$((PASS+1))
  else
    echo "✗ $name (missing: $needle)"
    echo "  response: $haystack"
    FAIL=$((FAIL+1))
  fi
}

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

echo "=== 页面测试 ==="
check "首页" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "移动端首页" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "登录页" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "注册页" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/register")"
check "竞拍列表" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check "晒场列表" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"
check "管理登录页" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

echo ""
echo "=== 用户认证 ==="
RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_contains "用户登录" '"ok":true' "$RESP"

RESP=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$BASE/m/me")
check "用户个人中心（已登录）" "200" "$RESP"

echo ""
echo "=== 管理员认证 ==="
for phone in 13900000001 13900000002 13900000003; do
  JAR="/tmp/admin-$phone.txt"
  RESP=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/admin/login" \
    -H "Content-Type: application/json" \
    -d "{\"phone\":\"$phone\",\"password\":\"admin123\"}")
  check_contains "管理员登录 $phone" '"ok":true' "$RESP"
  CODE=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$BASE/admin")
  check "管理后台 $phone" "200" "$CODE"
done

echo ""
echo "=== 第三方 SSO ==="
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test_sso_user")
check_contains "获取第三方 token" '"token"' "$TOKEN_RESP"
TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
SSO_JAR="/tmp/sso-cookies.txt"
RESP=$(curl -s -c "$SSO_JAR" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
check_contains "第三方 SSO 登录" '"ok":true' "$RESP"

echo ""
echo "=== 竞拍功能 ==="
AUCTION_HTML=$(curl -s "$BASE/m/auction")
PROJECT_ID=$(echo "$AUCTION_HTML" | grep -oP 'href="/m/auction/\Kcm[a-z0-9]+' | head -1 || true)
if [ -n "$PROJECT_ID" ]; then
  check "竞拍详情页" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction/$PROJECT_ID")"
  BID_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount": 8400}')
  check_contains "竞拍出价" '"ok":true' "$BID_RESP"
else
  echo "✗ 未找到竞拍项目"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== 晒场预约 ==="
DRYING_HTML=$(curl -s "$BASE/m/drying")
LISTING_ID=$(echo "$DRYING_HTML" | grep -oP 'href="/m/drying/\Kcm[a-z0-9]+' | head -1 || true)
if [ -n "$LISTING_ID" ]; then
  check "晒场详情页" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying/$LISTING_ID")"
  START=$(date -d "+1 day" +%Y-%m-%d)
  END=$(date -d "+2 days" +%Y-%m-%d)
  RESERVE_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check_contains "晒场预约" '"ok":true' "$RESERVE_RESP"
else
  echo "✗ 未找到晒场列表"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== 管理后台页面 ==="
ADMIN_JAR="/tmp/admin-13900000001.txt"
curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' > /dev/null
for page in assets auctions drying organizations admins audit config dict announcements registrations; do
  CODE=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin/$page")
  check "管理页 /admin/$page" "200" "$CODE"
done

echo ""
echo "=== 未授权访问 ==="
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")
check "未登录访问管理后台（应重定向）" "307" "$CODE"

echo ""
echo "=============================="
echo "通过: $PASS  失败: $FAIL"
echo "=============================="
[ "$FAIL" -eq 0 ]
