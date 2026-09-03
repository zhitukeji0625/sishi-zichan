#!/usr/bin/env bash
# 冒烟测试：须从仓库根目录运行（npm run test:smoke）
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/smoke-admin-cookies.txt"
USER_COOKIE="/tmp/smoke-user-cookies.txt"
rm -f "$COOKIE_JAR" "$USER_COOKIE"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

check_contains() {
  local name="$1" needle="$2" body="$3"
  if echo "$body" | grep -q "$needle"; then
    echo "✓ $name"
    PASS=$((PASS+1))
  else
    echo "✗ $name (missing: $needle)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== 页面 ==="
check "首页" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")"
check "管理登录" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")"
check "移动端" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")"
check "竞拍列表" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")"
check "晒场列表" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying")"
check "icon" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/icon")"

echo ""
echo "=== 认证 ==="
ADMIN_RESP=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_contains "管理员登录" "ok" "$ADMIN_RESP"
check "未登录管理重定向" "307" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/assets")"
check "已登录管理页" "200" "$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/admin/assets")"
check "字典页" "200" "$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/admin/dict")"

USER_RESP=$(curl -s -c "$USER_COOKIE" -b "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_contains "用户登录" "ok" "$USER_RESP"

echo ""
echo "=== API ==="
check "上传非multipart" "400" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d "{}")"

DICT_COUNT=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dictCategory.count().then(c => { console.log(c); p.\$disconnect(); });
" 2>/dev/null)
if [ "${DICT_COUNT:-0}" -gt 0 ] 2>/dev/null; then
  echo "✓ 字典数据 ($DICT_COUNT 类)"
  PASS=$((PASS+1))
else
  echo "✗ 字典数据为空"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== 竞拍 ==="
curl -s "$BASE/" > /dev/null
sleep 1

PROJECT_ID=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then(r => { console.log(r?.id || ''); p.\$disconnect(); });
" 2>/dev/null)

if [ -n "$PROJECT_ID" ]; then
  check_contains "竞拍详情" "起拍" "$(curl -s -b "$USER_COOKIE" "$BASE/m/auction/$PROJECT_ID")"
  START_PRICE=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' }, select: { startPrice: true } })
  .then(r => { console.log(r?.startPrice?.toString() || '100'); p.\$disconnect(); });
" 2>/dev/null)
  BID_RESP=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\": $START_PRICE}")
  if echo "$BID_RESP" | grep -qE 'ok|error|最低'; then
    echo "✓ 出价 API"
    PASS=$((PASS+1))
  else
    echo "✗ 出价 API: $BID_RESP"
    FAIL=$((FAIL+1))
  fi
else
  echo "✗ 无 LIVE 竞拍"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== 结果: $PASS 通过, $FAIL 失败 ==="
[ "$FAIL" -eq 0 ]
