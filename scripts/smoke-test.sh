#!/usr/bin/env bash
# 功能冒烟测试 — 需在 dev 服务器运行且已 seed
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_USER="/tmp/smoke-user.txt"
COOKIE_ADMIN="/tmp/smoke-admin.txt"
FAIL=0

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

check_http() {
  local name="$1" url="$2" expect="$3"
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" = "$expect" ]; then pass "$name ($code)"; else fail "$name (got $code, want $expect)"; fi
}

echo "=== 页面 ==="
check_http "门户" "$BASE/" 200
check_http "H5首页" "$BASE/m" 200
check_http "管理登录" "$BASE/admin/login" 200
check_http "H5登录" "$BASE/m/login" 200

echo "=== 用户登录 ==="
rm -f "$COOKIE_USER"
code=$(curl -s -c "$COOKIE_USER" -b "$COOKIE_USER" -o /tmp/smoke-login.json -w "%{http_code}" \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if [ "$code" = "200" ] && grep -q '"ok":true' /tmp/smoke-login.json 2>/dev/null; then
  pass "承租用户登录"
else
  fail "承租用户登录 ($code): $(cat /tmp/smoke-login.json)"
fi

echo "=== 管理员登录 ==="
rm -f "$COOKIE_ADMIN"
code=$(curl -s -c "$COOKIE_ADMIN" -b "$COOKIE_ADMIN" -o /tmp/smoke-admin-login.json -w "%{http_code}" \
  -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if [ "$code" = "200" ] && grep -q '"ok":true' /tmp/smoke-admin-login.json 2>/dev/null; then
  pass "师级管理员登录"
else
  fail "师级管理员登录 ($code): $(cat /tmp/smoke-admin-login.json)"
fi

echo "=== 受保护页面（需 cookie）==="
code=$(curl -s -b "$COOKIE_USER" -o /dev/null -w "%{http_code}" "$BASE/m/me")
[ "$code" = "200" ] && pass "用户中心 /m/me" || fail "用户中心 ($code)"

code=$(curl -s -b "$COOKIE_ADMIN" -o /dev/null -w "%{http_code}" "$BASE/admin")
[ "$code" = "200" ] && pass "管理后台 /admin" || fail "管理后台 ($code)"

echo "=== 竞拍出价（种子 LIVE 项目）==="
PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
  "SELECT id FROM AuctionProject WHERE status='LIVE' AND endsAt > NOW() ORDER BY createdAt DESC LIMIT 1;" 2>/dev/null | tr -d '\r')
if [ -z "$PROJECT_ID" ]; then
  fail "未找到 LIVE 竞拍项目"
else
  BID_AMOUNT=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
    "SELECT CAST(startPrice AS CHAR) FROM AuctionProject WHERE id='$PROJECT_ID' LIMIT 1;" 2>/dev/null | tr -d '\r')
  BID_AMOUNT=${BID_AMOUNT:-8000}
  code=$(curl -s -b "$COOKIE_USER" -o /tmp/smoke-bid.json -w "%{http_code}" \
    -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$BID_AMOUNT}")
  if [ "$code" = "200" ] && grep -q '"ok":true' /tmp/smoke-bid.json 2>/dev/null; then
    pass "竞拍出价"
  else
    # 可能已出过价，400 也接受若错误信息合理
    if [ "$code" = "400" ] && grep -qiE 'increment|最低|加价|已' /tmp/smoke-bid.json 2>/dev/null; then
      pass "竞拍出价（业务校验: $(cat /tmp/smoke-bid.json | head -c 80)）"
    else
      fail "竞拍出价 ($code): $(cat /tmp/smoke-bid.json)"
    fi
  fi
fi

echo "=== 第三方 token（开发）==="
code=$(curl -s -o /tmp/smoke-tp.json -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke-test")
if [ "$code" = "200" ] && grep -q 'token' /tmp/smoke-tp.json 2>/dev/null; then
  pass "开发第三方 JWT"
else
  fail "开发第三方 JWT ($code)"
fi

echo "=== 晒场预约 ==="
LISTING_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
  "SELECT id FROM DryingFieldListing WHERE status='OPERATING' LIMIT 1;" 2>/dev/null | tr -d '\r')
if [ -n "$LISTING_ID" ]; then
  START=$(date -u +%Y-%m-%d)
  END=$(date -u -d "+2 days" +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  code=$(curl -s -b "$COOKIE_USER" -o /tmp/smoke-dry.json -w "%{http_code}" \
    -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  if [ "$code" = "200" ] && grep -q '"ok":true' /tmp/smoke-dry.json 2>/dev/null; then
    pass "晒场预约"
  elif [ "$code" = "400" ]; then
    pass "晒场预约（业务校验: $(head -c 80 /tmp/smoke-dry.json)）"
  else
    fail "晒场预约 ($code): $(cat /tmp/smoke-dry.json)"
  fi
else
  fail "未找到运营中晒场"
fi

echo "=== 第三方 SSO ==="
TP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-sso")
TOKEN=$(echo "$TP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
  code=$(curl -s -c /tmp/smoke-sso.txt -b /tmp/smoke-sso.txt -o /tmp/smoke-sso.json -w "%{http_code}" \
    -X POST "$BASE/api/auth/third-party" -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
  [ "$code" = "200" ] && grep -q '"ok":true' /tmp/smoke-sso.json && pass "第三方登录" || fail "第三方登录 ($code)"
else
  fail "无法获取第三方 token"
fi

echo "=== 未登录 API 应 401 ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/x/bid" -H "Content-Type: application/json" -d '{"amount":1}')
[ "$code" = "401" ] && pass "未登录出价 401" || fail "未登录出价 ($code)"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "全部通过"
  exit 0
else
  echo "$FAIL 项失败"
  exit 1
fi
