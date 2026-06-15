#!/usr/bin/env bash
# API 功能冒烟测试（需 dev server 运行于 BASE_URL）
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ADMIN_COOKIE="/tmp/sishi-admin-cookie.txt"
USER_COOKIE="/tmp/sishi-user-cookie.txt"
rm -f "$ADMIN_COOKIE" "$USER_COOKIE"

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

echo "=== 四师资产租赁 功能冒烟测试 ==="
echo "BASE_URL=$BASE_URL"
echo

# 1. 门户首页
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
check_status "门户首页" "200" "$code"

# 2. 管理端登录页
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/admin/login")
check_status "管理端登录页" "200" "$code"

# 3. 移动端 H5
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/m")
check_status "移动端 H5" "200" "$code"

# 4. 管理端登录成功
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_COOKIE" -X POST "$BASE_URL/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
check_status "管理端登录" "200" "$code"

# 5. 管理端错误密码
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"wrong"}')
code=$(echo "$resp" | tail -1)
check_status "管理端错误密码" "401" "$code"

# 6. 用户登录成功
resp=$(curl -s -w "\n%{http_code}" -c "$USER_COOKIE" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
check_status "用户登录" "200" "$code"

# 7. 未登录访问受保护 API
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d '{}')
check_status "未登录受保护 API" "401" "$code"

# 8. 开发环境第三方 token
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/dev/third-party-token?u_id=test_user")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check_status "第三方 token 接口" "200" "$code"
if echo "$body" | grep -q '"token"'; then pass "第三方 token 含 token 字段"; else fail "第三方 token 缺少 token 字段"; fi

# 9. 注册参数校验
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"bad","password":"123"}')
code=$(echo "$resp" | tail -1)
check_status "注册参数校验" "400" "$code"

# 10. 上传非 multipart 返回 400
resp=$(curl -s -w "\n%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE_URL/api/upload" \
  -H "Content-Type: application/json" \
  -d '{"file":"x"}')
code=$(echo "$resp" | tail -1)
check_status "上传非 multipart" "400" "$code"

# 11. 竞拍出价（动态计算最低出价）
PROJECT_ID=$(curl -s "$BASE_URL/m/auction" 2>/dev/null | grep -oP 'href="/m/auction/\K[^"]+' | head -1 || true)
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
      .then(r => { console.log(r?.id ?? ''); return p.\$disconnect(); })
      .catch(() => process.exit(1));
  " 2>/dev/null || true)
fi

if [ -n "$PROJECT_ID" ]; then
  BID_INFO=$(node -e "
    const { PrismaClient, Prisma } = require('@prisma/client');
    const p = new PrismaClient();
    (async () => {
      const project = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
      if (!project) { process.exit(1); }
      const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
      const min = top
        ? Number(top.amount) + Number(project.bidStep)
        : Number(project.startPrice);
      console.log(min);
      await p.\$disconnect();
    })();
  " 2>/dev/null || echo "8400")
  resp=$(curl -s -w "\n%{http_code}" -b "$USER_COOKIE" -X POST "$BASE_URL/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$BID_INFO}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  check_status "竞拍出价" "200" "$code"
  if echo "$body" | grep -q '"ok":true'; then pass "竞拍出价返回 ok"; else fail "竞拍出价响应异常: $body"; fi
else
  fail "竞拍出价（未找到 LIVE 项目）"
fi

# 12. 晒场预约
LISTING_ID=$(node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
    .then(r => { console.log(r?.id ?? ''); return p.\$disconnect(); })
    .catch(() => process.exit(1));
" 2>/dev/null || true)

if [ -n "$LISTING_ID" ]; then
  START=$(date -u +%Y-%m-%d)
  END=$(date -u -d "+2 days" +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$USER_COOKIE" -X POST "$BASE_URL/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  # 200 成功或 400 容量已满均视为 API 正常
  if [ "$code" = "200" ]; then
    pass "晒场预约 ($code)"
    if echo "$body" | grep -q '"ok":true'; then pass "晒场预约返回 ok"; else fail "晒场预约响应异常"; fi
  elif [ "$code" = "400" ]; then
    pass "晒场预约 ($code - 容量/规则限制，API 正常)"
  else
    fail "晒场预约 (expected 200 or 400, got $code: $body)"
  fi
else
  fail "晒场预约（未找到 OPERATING 晒场）"
fi

echo
echo "=== 结果: $PASS 通过, $FAIL 失败 ==="
[ "$FAIL" -eq 0 ]
