#!/usr/bin/env bash
# 端到端功能测试（需 dev server 运行于 BASE_URL）
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ADMIN_COOKIE="/tmp/ft_admin_cookies.txt"
USER_COOKIE="/tmp/ft_user_cookies.txt"

pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; }

check_http() {
  local url="$1" expect="$2" label="$3" cookie="${4:-}"
  local code
  if [ -n "$cookie" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -b "$cookie" "$url")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  fi
  if [ "$code" = "$expect" ]; then pass "$label ($code)"; else fail "$label (got $code, want $expect)"; fi
}

check_json() {
  local method="$1" url="$2" body="$3" expect_field="$4" label="$5" cookie="${6:-}"
  local resp
  if [ -n "$cookie" ]; then
    resp=$(curl -s -b "$cookie" -X "$method" "$url" -H "Content-Type: application/json" -d "$body")
  else
    resp=$(curl -s -X "$method" "$url" -H "Content-Type: application/json" -d "$body")
  fi
  if echo "$resp" | grep -q "$expect_field"; then pass "$label"; else fail "$label: $resp"; fi
}

echo "=== 功能完整性测试 @ $BASE_URL ==="

# 页面可达性
check_http "$BASE_URL/" "200" "首页"
check_http "$BASE_URL/m/login" "200" "移动端登录页"
check_http "$BASE_URL/admin/login" "200" "后台登录页"

# 认证
check_json POST "$BASE_URL/api/auth/admin/login" '{"phone":"13900000001","password":"admin123"}' '"ok":true' "师级管理员登录" && \
  curl -s -c "$ADMIN_COOKIE" -X POST "$BASE_URL/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}' > /dev/null

check_json POST "$BASE_URL/api/auth/login" '{"phone":"13800138000","password":"user123"}' '"ok":true' "承租用户登录" && \
  curl -s -c "$USER_COOKIE" -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}' > /dev/null

# 受保护路由
check_http "$BASE_URL/admin" "200" "后台首页（已登录）" "$ADMIN_COOKIE"
check_http "$BASE_URL/m/me" "200" "个人中心（已登录）" "$USER_COOKIE"

# 未登录 API 保护
check_json POST "$BASE_URL/api/m/auction/test/bid" '{"amount":100}' '"error"' "未登录出价被拒绝"

# 注册（11 位手机号）
PHONE="$(python3 -c 'import time; print(f"138{int(time.time()) % 100000000:08d}")')"
check_json POST "$BASE_URL/api/auth/register" \
  "{\"phone\":\"$PHONE\",\"password\":\"user123\",\"name\":\"测试\"}" \
  '"ok":true' "用户注册"

# 晒场预约：超出 maxAdvanceDays 应拒绝
FAR_RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE_URL/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"cmnhdd6f5000jjsb2kdc8e7tl","startDate":"2026-12-01","endDate":"2026-12-05"}')
if echo "$FAR_RESP" | grep -q '"error"'; then pass "晒场超期预约被拒绝"; else fail "晒场超期预约应拒绝: $FAR_RESP"; fi

# 晒场预约：合法日期
NEAR_START=$(date -d "+2 days" +%Y-%m-%d 2>/dev/null || date -v+2d +%Y-%m-%d)
NEAR_END=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
check_json POST "$BASE_URL/api/m/drying/reserve" \
  "{\"listingId\":\"cmnhdd6f5000jjsb2kdc8e7tl\",\"startDate\":\"$NEAR_START\",\"endDate\":\"$NEAR_END\"}" \
  '"ok":true' "晒场合法预约" "$USER_COOKIE"

# 竞拍：获取 LIVE 项目 ID
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const proj = await p.auctionProject.findFirst({ where: { code: 'DEMO_LIVE_AUCTION' } })
    ?? await p.auctionProject.findFirst({ where: { status: 'LIVE' } });
  console.log(proj?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [ -n "$PROJECT_ID" ]; then
  LOW_RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE_URL/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":1}')
  if echo "$LOW_RESP" | grep -q '"error"'; then pass "出价低于最低应拒绝"; else fail "出价低于最低应拒绝: $LOW_RESP"; fi
  curl -s -b "$USER_COOKIE" -X POST "$BASE_URL/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":10000}' | grep -qE '"ok":true|"error"' && pass "竞拍出价 API 可响应"
else
  fail "未找到 LIVE 竞拍项目"
fi

# LIVE 竞拍禁止支付租金
if [ -n "$PROJECT_ID" ]; then
  RENT_RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE_URL/api/m/payments/mock" \
    -H "Content-Type: application/json" \
    -d "{\"purpose\":\"AUCTION_RENT\",\"auctionProjectId\":\"$PROJECT_ID\"}")
  if echo "$RENT_RESP" | grep -q '竞拍尚未结束'; then pass "LIVE 竞拍禁止支付租金"; else fail "LIVE 竞拍应禁止租金: $RENT_RESP"; fi
fi

# 上传：非 multipart 应拒绝
UPLOAD_RESP=$(curl -s -b "$ADMIN_COOKIE" -X POST "$BASE_URL/api/upload" -H "Content-Type: application/json" -d '{}')
if echo "$UPLOAD_RESP" | grep -q 'multipart'; then pass "上传非 multipart 被拒绝"; else fail "上传应校验 multipart: $UPLOAD_RESP"; fi

# 第三方 token（仅 dev）
if curl -s "$BASE_URL/api/dev/third-party-token" | grep -q '"token"'; then pass "第三方 token 生成"; else fail "第三方 token"; fi

# 后台页面
for path in /admin/assets /admin/auctions /admin/drying /admin/registrations /admin/audit; do
  check_http "$BASE_URL$path" "200" "后台 $path" "$ADMIN_COOKIE"
done

# 移动端页面
for path in /m /m/auction /m/drying /m/orders; do
  check_http "$BASE_URL$path" "200" "移动端 $path" "$USER_COOKIE"
done

echo ""
echo "=== 结果: $PASS 通过, $FAIL 失败 ==="
[ "$FAIL" -eq 0 ]
