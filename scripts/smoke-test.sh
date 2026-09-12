#!/usr/bin/env bash
# API 冒烟测试 — 须在 dev 模式 (npm run dev) 下运行
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
PASS=0
FAIL=0
TOTAL=0

cleanup() { rm -f "$COOKIE_JAR" "$ADMIN_JAR"; }
trap cleanup EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual) $body"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  TOTAL=$((TOTAL + 1))
  if echo "$body" | grep -q '"ok":true'; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== 四师资产租赁 API 冒烟测试 ==="
echo "Base: $BASE"
echo ""

# 1. 首页
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "GET /" "200" "$code"

# 2. 管理员登录
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/admin/login" "200" "$code"
assert_json_ok "admin login ok" "$body"

# 3. 管理员错误密码
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"wrong"}')
assert_status "admin login wrong password" "401" "$code"

# 4. 用户登录
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/login" "200" "$code"
assert_json_ok "user login ok" "$body"

# 5. 用户注册
PHONE="199$(date +%s | tail -c 10)"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/register" "200" "$code"
assert_json_ok "user register ok" "$body"

# 6. 未登录出价
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake-id/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
assert_status "bid without login" "401" "$code"

# 7. 动态查询 LIVE 竞拍并出价
BID_INFO=$(cd "$(dirname "$0")/.." && npx tsx scripts/smoke-bid-info.ts 2>/dev/null || echo "NONE")
if [ "$BID_INFO" = "NONE" ] || [ -z "$BID_INFO" ]; then
  echo "  ⚠ 无 LIVE 竞拍项目，跳过出价测试"
  TOTAL=$((TOTAL + 1))
  FAIL=$((FAIL + 1))
else
  PROJECT_ID=$(echo "$BID_INFO" | cut -d'|' -f1)
  MIN_BID=$(echo "$BID_INFO" | cut -d'|' -f2)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -1)
  assert_status "POST bid (amount=$MIN_BID)" "200" "$code" "$body"
  assert_json_ok "bid ok" "$body"
fi

# 8. 晒场预约
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();const l=await p.dryingFieldListing.findFirst({where:{status:'OPERATING'}});console.log(l?.id??'');await p.\$disconnect();})();" 2>/dev/null)
START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
END=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
if [ -n "$LISTING_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -1)
  assert_status "POST /api/m/drying/reserve" "200" "$code" "$body"
  assert_json_ok "drying reserve ok" "$body"
else
  echo "  ⚠ 无 OPERATING 晒场，跳过预约测试"
  TOTAL=$((TOTAL + 2))
  FAIL=$((FAIL + 2))
fi

# 9. 晒场预约无效参数
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -d '{"listingId":"x"}')
assert_status "drying reserve invalid params" "400" "$code"

# 10. 非 multipart 上传应返回 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"file":"test"}')
assert_status "upload non-multipart" "400" "$code"

# 11. 非 multipart 资产创建应返回 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"test"}')
assert_status "admin assets non-multipart" "400" "$code"

# 12. 未登录上传
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: multipart/form-data" -F "file=@/dev/null")
assert_status "upload without login" "401" "$code"

# 13. dev token
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke")
assert_status "GET /api/dev/third-party-token" "200" "$code"

# 14. 移动端页面
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
assert_status "GET /m" "200" "$code"

# 15. 管理后台（已登录 cookie 会 redirect 或 200）
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
assert_status "GET /admin (logged in)" "200" "$code"

# 16. 用户登出
resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/logout" "200" "$code"

# 17. 管理员登出
resp=$(curl -s -w "\n%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
code=$(echo "$resp" | tail -1)
assert_status "POST /api/auth/admin/logout" "200" "$code"

echo ""
echo "=== 结果: $PASS/$TOTAL 通过, $FAIL 失败 ==="
[ "$FAIL" -eq 0 ]
