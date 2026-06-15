#!/usr/bin/env bash
# 功能冒烟测试：需 dev server (localhost:3000) + MariaDB + seed
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0; FAIL=0

check() {
  local name="$1" code="$2" expected="$3"
  if [ "$code" = "$expected" ]; then echo "✓ $name"; PASS=$((PASS+1))
  else echo "✗ $name (expected $expected, got $code)"; FAIL=$((FAIL+1)); fi
}

echo "=== 页面可达性 ==="
check "首页" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")" "200"
check "管理登录" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")" "200"
check "H5首页" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")" "200"

echo ""
echo "=== 认证 ==="
curl -s -c /tmp/ft_admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}' > /dev/null
check "管理员登录" "$(curl -s -b /tmp/ft_admin.txt -o /dev/null -w '%{http_code}' "$BASE/admin")" "200"

curl -s -c /tmp/ft_user.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}' > /dev/null
check "用户登录" "$(curl -s -b /tmp/ft_user.txt -o /dev/null -w '%{http_code}' "$BASE/m/me")" "200"

echo ""
echo "=== API 错误处理 ==="
check "upload 未登录" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload")" "401"
check "upload 非 multipart" "$(curl -s -b /tmp/ft_admin.txt -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')" "400"
check "admin assets 非 multipart" "$(curl -s -b /tmp/ft_admin.txt -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{}')" "400"
check "bid 未登录" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/x/bid" -H "Content-Type: application/json" -d '{"amount":100}')" "401"

echo ""
echo "=== 核心业务 API ==="
# 刷新演示竞拍并重置出价记录
(cd "$(dirname "$0")/.." && npm run db:seed) > /dev/null 2>&1 || true

IDS=$(cd "$(dirname "$0")/.." && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const project = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'asc' } });
  const listing = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  if (!project || !listing) { process.exit(1); }
  const minBid = Number(project.startPrice) + Number(project.bidStep);
  console.log(project.id + ' ' + listing.id + ' ' + minBid);
  await p.\$disconnect();
})().catch(() => process.exit(1));
") || { echo "✗ 无法获取演示数据 ID"; FAIL=$((FAIL+1)); IDS=""; }

if [ -n "$IDS" ]; then
  PROJECT_ID=$(echo "$IDS" | awk '{print $1}')
  LISTING_ID=$(echo "$IDS" | awk '{print $2}')
  MIN_BID=$(echo "$IDS" | awk '{print $3}')

  BID_RESP=$(curl -s -b /tmp/ft_user.txt -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  if echo "$BID_RESP" | grep -q '"ok":true'; then echo "✓ 竞拍出价"; PASS=$((PASS+1))
  else echo "✗ 竞拍出价 ($BID_RESP)"; FAIL=$((FAIL+1)); fi

  RESERVE_RESP=$(curl -s -b /tmp/ft_user.txt -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-06-15\",\"endDate\":\"2026-06-16\"}")
  if echo "$RESERVE_RESP" | grep -q '"ok":true'; then echo "✓ 晒场预约"; PASS=$((PASS+1))
  else echo "✗ 晒场预约 ($RESERVE_RESP)"; FAIL=$((FAIL+1)); fi
fi

echo ""
echo "通过: $PASS  失败: $FAIL"
[ "$FAIL" -eq 0 ]
