#!/usr/bin/env bash
# API 冒烟测试 — 须在 dev 模式 (npm run dev) 下运行
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
USER_JAR="/tmp/smoke_user.txt"
ADMIN_JAR="/tmp/smoke_admin.txt"
rm -f "$USER_JAR" "$ADMIN_JAR"

pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✗ $1 — $2"; }

check_http() {
  local name="$1" url="$2" expected="${3:-200}" extra="${4:-}"
  local code
  code=$(curl -sf $extra -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [ "$code" = "$expected" ]; then pass "$name"; else fail "$name" "HTTP $code (expected $expected)"; fi
}

check_json() {
  local name="$1" method="$2" url="$3" body="$4" expect="$5" jar="${6:-}"
  local resp
  resp=$(curl -s -X "$method" $jar -H "Content-Type: application/json" -d "$body" "$url")
  if echo "$resp" | grep -q "$expect"; then pass "$name"; else fail "$name" "$resp"; fi
}

echo "=== 四师资产租赁 冒烟测试 ==="
echo "Base: $BASE"
echo ""

echo "--- 页面 ---"
check_http "门户首页" "$BASE/"
check_http "H5 首页" "$BASE/m"
check_http "管理登录页" "$BASE/admin/login"
check_http "H5 登录页" "$BASE/m/login"

echo "--- 认证 ---"
check_json "承租用户登录" POST "$BASE/api/auth/login" \
  '{"phone":"13800138000","password":"user123"}' '"ok":true' "-c $USER_JAR"
check_json "管理员登录" POST "$BASE/api/auth/admin/login" \
  '{"phone":"13900000001","password":"admin123"}' '"ok":true' "-c $ADMIN_JAR"
check_json "错误密码拒绝" POST "$BASE/api/auth/login" \
  '{"phone":"13800138000","password":"wrong"}' '"error"'
check_json "重复注册拒绝" POST "$BASE/api/auth/register" \
  '{"phone":"13800138000","password":"user123","name":"x"}' '"error"'

echo "--- H5 页面 (登录后) ---"
check_http "竞拍列表" "$BASE/m/auction" 200 "-b $USER_JAR"
check_http "晒场列表" "$BASE/m/drying" 200 "-b $USER_JAR"
check_http "个人中心" "$BASE/m/me" 200 "-b $USER_JAR"
check_http "订单页" "$BASE/m/orders" 200 "-b $USER_JAR"

echo "--- 管理后台 ---"
check_http "工作台" "$BASE/admin" 200 "-b $ADMIN_JAR"
check_http "资产列表" "$BASE/admin/assets" 200 "-b $ADMIN_JAR"
check_http "竞拍管理" "$BASE/admin/auctions" 200 "-b $ADMIN_JAR"
check_http "审计日志" "$BASE/admin/audit" 200 "-b $ADMIN_JAR"

echo "--- API 边界 ---"
check_json "未登录出价拒绝" POST "$BASE/api/m/auction/fake/bid" \
  '{"amount":100}' '"error"'
check_json "无效 SSO token" POST "$BASE/api/auth/third-party" \
  '{"token":"invalid"}' '"error"'

# 非 multipart 应返回 400 而非 500
CODE=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"x"}' -w "%{http_code}" -o /tmp/smoke_assets.json)
if [ "$CODE" = "400" ]; then pass "资产 API 非表单返回 400"; else fail "资产 API 非表单返回 400" "HTTP $CODE"; fi

CODE=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}' -w "%{http_code}" -o /tmp/smoke_upload.json)
if [ "$CODE" = "400" ]; then pass "上传 API 非表单返回 400"; else fail "上传 API 非表单返回 400" "HTTP $CODE"; fi

echo "--- 业务流 ---"
# 动态日期避免重叠
START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
END=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
LISTING_ID=$(npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)
if [ -n "$LISTING_ID" ]; then
  check_json "晒场预约" POST "$BASE/api/m/drying/reserve" \
    "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}" \
    '"ok":true' "-b $USER_JAR"
else
  fail "晒场预约" "no listing in DB"
fi

# 动态出价：查 LIVE 项目
BID_INFO=$(npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const project = await p.auctionProject.findFirst({ where: { status: 'LIVE' } });
  if (!project) { console.log(''); await p.\$disconnect(); return; }
  const top = await p.auctionBid.findFirst({ where: { projectId: project.id }, orderBy: { amount: 'desc' } });
  const min = top ? Number(top.amount) + Number(project.bidStep) : Number(project.startPrice);
  console.log(JSON.stringify({ id: project.id, min }));
  await p.\$disconnect();
})();
" 2>/dev/null)
PROJECT_ID=$(echo "$BID_INFO" | python3 -c "import sys,json; d=json.loads(sys.stdin.read() or '{}'); print(d.get('id',''))" 2>/dev/null || true)
MIN_BID=$(echo "$BID_INFO" | python3 -c "import sys,json; d=json.loads(sys.stdin.read() or '{}'); print(d.get('min',''))" 2>/dev/null || true)
if [ -n "$PROJECT_ID" ] && [ -n "$MIN_BID" ]; then
  check_json "竞拍出价" POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    "{\"amount\":$MIN_BID}" '"ok":true' "-b $USER_JAR"
else
  fail "竞拍出价" "no LIVE project (run npm run db:seed to refresh demo auction)"
fi

echo ""
echo "=== 结果: $PASS 通过, $FAIL 失败 ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
