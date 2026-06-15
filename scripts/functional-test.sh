#!/usr/bin/env bash
# API 功能冒烟测试（需服务运行在 localhost:3000）
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
PASS=0
FAIL=0

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== 页面可达性 ==="
assert_status "首页 /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
assert_status "H5 /m" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
assert_status "管理登录 /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
assert_status "未登录保护 /admin" 307 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")"

echo "=== 用户登录 ==="
USER_RESP=$(curl -s -w '\n%{http_code}' -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
USER_CODE=$(echo "$USER_RESP" | tail -1)
assert_status "用户登录" 200 "$USER_CODE"

echo "=== 管理员登录 ==="
ADMIN_RESP=$(curl -s -w '\n%{http_code}' -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_RESP" | tail -1)
assert_status "管理员登录" 200 "$ADMIN_CODE"

echo "=== 未登录 API 保护 ==="
assert_status "未登录出价" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/fake/bid" -H 'Content-Type: application/json' -d '{"amount":100}')"

echo "=== 第三方 token（开发） ==="
if curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test_user" | grep -q 200; then
  TP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test_user")
  assert_status "dev third-party-token" 200 "$TP_CODE"
else
  echo "⊘ dev third-party-token（生产模式跳过）"
fi

echo "=== 上传接口校验 ==="
assert_status "上传非 multipart" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" -b "$ADMIN_JAR" -H 'Content-Type: application/json' -d '{}')"
assert_status "上传未登录" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')"

echo "=== 竞拍与晒场（需登录） ==="
# 获取 LIVE 竞拍项目 ID
PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot -N -e \
  "SELECT id FROM sishi.AuctionProject WHERE status='LIVE' ORDER BY createdAt DESC LIMIT 1" 2>/dev/null || true)
LISTING_ID=$(sudo docker exec mariadb mariadb -uroot -proot -N -e \
  "SELECT id FROM sishi.DryingFieldListing WHERE status='OPERATING' LIMIT 1" 2>/dev/null || true)

if [ -n "$PROJECT_ID" ]; then
  BID_AMOUNT=$(sudo docker exec mariadb mariadb -uroot -proot -N -e \
    "SELECT COALESCE(
      (SELECT MAX(amount) + bidStep FROM sishi.AuctionBid b JOIN sishi.AuctionProject p ON p.id=b.projectId WHERE p.id='$PROJECT_ID'),
      (SELECT startPrice FROM sishi.AuctionProject WHERE id='$PROJECT_ID')
    )" 2>/dev/null)
  BID_RESP=$(curl -s -w '\n%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' \
    -d "{\"amount\":$BID_AMOUNT}")
  BID_CODE=$(echo "$BID_RESP" | tail -1)
  assert_status "竞拍出价" 200 "$BID_CODE"
else
  echo "✗ 无 LIVE 竞拍项目，跳过出价测试"
  FAIL=$((FAIL + 1))
fi

if [ -n "$LISTING_ID" ]; then
  START_DATE=$(date -u +%Y-%m-%d)
  END_DATE=$(date -u -d '+2 days' +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  RESERVE_RESP=$(curl -s -w '\n%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  RESERVE_CODE=$(echo "$RESERVE_RESP" | tail -1)
  assert_status "晒场预约" 200 "$RESERVE_CODE"
else
  echo "✗ 无运营中晒场，跳过预约测试"
  FAIL=$((FAIL + 1))
fi

echo "=== 注册校验 ==="
assert_status "注册缺参" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d '{}')"

rm -f "$COOKIE_JAR" "$ADMIN_JAR"
echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ]
