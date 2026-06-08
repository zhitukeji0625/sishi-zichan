#!/bin/bash
# Functional smoke test for key API endpoints
set -euo pipefail
BASE="http://localhost:3000"
COOKIE_JAR="/tmp/sishi-smoke-cookies.txt"
FAIL=0

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAIL=1; }

echo "=== 页面可达性 ==="
for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then pass "$path -> $code"; else fail "$path -> $code (expected 200)"; fi
done

echo ""
echo "=== 用户登录 ==="
rm -f "$COOKIE_JAR"
resp=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$resp" | grep -q '"ok":true'; then pass "用户登录成功"; else fail "用户登录失败: $resp"; fi

echo ""
echo "=== 管理员登录 ==="
ADMIN_JAR="/tmp/sishi-smoke-admin-cookies.txt"
resp=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$resp" | grep -q '"ok":true'; then pass "管理员登录成功"; else fail "管理员登录失败: $resp"; fi

echo ""
echo "=== 第三方 Token ==="
resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test_user")
if echo "$resp" | grep -q '"token"'; then
  pass "第三方 token 获取成功"
  TP_TOKEN=$(echo "$resp" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  resp2=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TP_TOKEN\"}")
  if echo "$resp2" | grep -q '"ok":true'; then pass "第三方登录成功"; else fail "第三方登录失败: $resp2"; fi
else
  fail "第三方 token 获取失败: $resp"
fi

echo ""
echo "=== 竞拍出价 ==="
PROJECT_ID=$(cd /workspace && npx tsx scripts/query-db.ts live-auction 2>/dev/null | tail -1)

if [ "$PROJECT_ID" != "NONE" ] && [ -n "$PROJECT_ID" ]; then
  PID=$(echo "$PROJECT_ID" | awk '{print $1}')
  PRICE=$(echo "$PROJECT_ID" | awk '{print $2}')
  # Re-login as demo user for bid
  curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"phone":"13800138000","password":"user123"}' > /dev/null
  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$PRICE}")
  if echo "$resp" | grep -q '"ok":true'; then pass "竞拍出价成功 (project=$PID)"; else fail "竞拍出价失败: $resp"; fi
else
  fail "未找到 LIVE 竞拍项目"
fi

echo ""
echo "=== 晒场预约 ==="
LISTING_ID=$(cd /workspace && npx tsx scripts/query-db.ts drying-listing 2>/dev/null | tail -1)

if [ "$LISTING_ID" != "NONE" ] && [ -n "$LISTING_ID" ]; then
  START=$(date -d "+30 days" +%Y-%m-%d 2>/dev/null || date -v+30d +%Y-%m-%d)
  END=$(date -d "+35 days" +%Y-%m-%d 2>/dev/null || date -v+35d +%Y-%m-%d)
  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  if echo "$resp" | grep -q '"ok":true'; then pass "晒场预约成功"; else fail "晒场预约失败: $resp"; fi
else
  fail "未找到运营中晒场"
fi

echo ""
echo "=== 管理后台页面（需登录） ==="
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying"; do
  code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" -L "$BASE$path")
  if [ "$code" = "200" ]; then pass "$path -> $code"; else fail "$path -> $code"; fi
done

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "=== 全部冒烟测试通过 ==="
  exit 0
else
  echo "=== 存在失败项 ==="
  exit 1
fi
