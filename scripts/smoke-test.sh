#!/usr/bin/env bash
# 冒烟测试：验证核心页面与 API 可用性
set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/smoke_user_cookies.txt"
ADMIN_JAR="/tmp/smoke_admin_cookies.txt"
PASS=0
FAIL=0

pass() { echo "✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "✗ $1"; FAIL=$((FAIL + 1)); }

check_status() {
  local name="$1" url="$2" expected="$3" jar="${4:-}"
  local code
  if [ -n "$jar" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -b "$jar" "$url")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  fi
  if [ "$code" = "$expected" ]; then pass "$name ($code)"; else fail "$name (expected $expected, got $code)"; fi
}

check_json_ok() {
  local name="$1" resp="$2"
  if echo "$resp" | grep -q '"ok":true'; then pass "$name"; else fail "$name ($resp)"; fi
}

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

echo "=== 页面 ==="
check_status "门户首页" "$BASE/" "200"
check_status "H5 首页" "$BASE/m" "200"
check_status "管理登录" "$BASE/admin/login" "200"
check_status "用户登录" "$BASE/m/login" "200"
check_status "用户注册" "$BASE/m/register" "200"

echo "=== 认证 API ==="
USER_LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_json_ok "用户登录 API" "$USER_LOGIN"

ADMIN_LOGIN=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json_ok "管理员登录 API" "$ADMIN_LOGIN"

TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test")
if echo "$TOKEN_RESP" | grep -q '"token"'; then pass "第三方 token"; else fail "第三方 token ($TOKEN_RESP)"; fi

echo "=== 管理后台页面 ==="
for path in /admin /admin/assets /admin/auctions /admin/drying /admin/organizations /admin/dict /admin/config; do
  check_status "Admin $path" "$BASE$path" "200" "$ADMIN_JAR"
done

echo "=== 移动端页面 ==="
for path in /m/auction /m/drying /m/me /m/orders; do
  check_status "Mobile $path" "$BASE$path" "200" "$COOKIE_JAR"
done

echo "=== 业务 API ==="
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then(r => { console.log(r?.id ?? ''); return p.\$disconnect(); });
" 2>/dev/null)

if [ -n "$PROJECT_ID" ]; then
  check_status "竞拍详情" "$BASE/m/auction/$PROJECT_ID" "200" "$COOKIE_JAR"
  BID_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":999999}')
  if echo "$BID_RESP" | grep -qE '"ok":true|"error"'; then pass "出价 API"; else fail "出价 API ($BID_RESP)"; fi
else
  fail "无 LIVE 竞拍项目"
fi

LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { console.log(r?.id ?? ''); return p.\$disconnect(); });
" 2>/dev/null)

if [ -n "$LISTING_ID" ]; then
  RESERVE_RESP=$(curl -s -b "$COOKIE_JAR" -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-09-01\",\"endDate\":\"2026-09-02\"}")
  HTTP_CODE=$(echo "$RESERVE_RESP" | tail -1)
  BODY=$(echo "$RESERVE_RESP" | head -n -1)
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "409" ]; then
    pass "晒场预约 API ($HTTP_CODE)"
  else
    fail "晒场预约 API ($HTTP_CODE: $BODY)"
  fi
else
  fail "无运营中晒场"
fi

UPLOAD_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
if [ "$UPLOAD_CODE" = "400" ]; then pass "上传 multipart 校验"; else fail "上传 multipart 校验 (got $UPLOAD_CODE)"; fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ]
