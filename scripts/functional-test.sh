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
check "H5登录" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")" "200"
check "H5竞拍" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")" "200"
check "H5晒场" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")" "200"

echo ""
echo "=== 认证 ==="
curl -s -c /tmp/ft_admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}' > /dev/null
check "管理员登录" "$(curl -s -b /tmp/ft_admin.txt -o /dev/null -w '%{http_code}' "$BASE/admin")" "200"

curl -s -c /tmp/ft_user.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}' > /dev/null
check "用户登录" "$(curl -s -b /tmp/ft_user.txt -o /dev/null -w '%{http_code}' "$BASE/m/me")" "200"

echo ""
echo "=== 第三方登录 ==="
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=ft_test" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
curl -s -c /tmp/ft_sso.txt -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}" > /dev/null
check "SSO登录" "$(curl -s -b /tmp/ft_sso.txt -o /dev/null -w '%{http_code}' "$BASE/m/me")" "200"

echo ""
echo "=== API 错误处理 ==="
check "upload 未登录" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload")" "401"
check "upload 非 multipart" "$(curl -s -b /tmp/ft_admin.txt -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')" "400"
check "admin assets 非 multipart" "$(curl -s -b /tmp/ft_admin.txt -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{}')" "400"
check "bid 未登录" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/x/bid" -H "Content-Type: application/json" -d '{"amount":100}')" "401"

echo ""
echo "=== 业务 API ==="
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'asc' } });
  console.log(proj?.id || '');
}
main().finally(() => p.\$disconnect());
" 2>/dev/null)

if [ -n "$PROJECT_ID" ]; then
  BID_AMOUNT=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
const p = new PrismaClient();
async function main() {
  const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
  if (!proj) return;
  const top = await p.auctionBid.findFirst({ where: { projectId: proj.id }, orderBy: { amount: 'desc' } });
  const min = top ? new Decimal(top.amount.toString()).plus(proj.bidStep.toString()) : new Decimal(proj.startPrice.toString());
  console.log(min.toFixed(2));
}
main().finally(() => p.\$disconnect());
" 2>/dev/null)
  BID_RESP=$(curl -s -b /tmp/ft_user.txt -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$BID_AMOUNT}")
  echo "$BID_RESP" | grep -q '"ok":true' && check "竞拍出价" "ok" "ok" || check "竞拍出价" "ok" "fail ($BID_RESP)"
else
  echo "✗ 竞拍出价 (no LIVE project)"
  FAIL=$((FAIL+1))
fi

LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(l?.id || '');
}
main().finally(() => p.\$disconnect());
" 2>/dev/null)

if [ -n "$LISTING_ID" ]; then
  DRY_RESP=$(curl -s -b /tmp/ft_user.txt -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-08-01\",\"endDate\":\"2026-08-03\"}")
  if echo "$DRY_RESP" | grep -q '"ok":true'; then
    check "晒场预约" "ok" "ok"
    RES_ID=$(echo "$DRY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
    # 审核通过后方可支付保证金
    cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  await p.dryingReservation.update({ where: { id: '$RES_ID' }, data: { status: 'APPROVED' } });
}
main().finally(() => p.\$disconnect());
" 2>/dev/null
    PAY_RESP=$(curl -s -b /tmp/ft_user.txt -X POST "$BASE/api/m/payments/mock" \
      -H "Content-Type: application/json" \
      -d "{\"purpose\":\"DRYING_DEPOSIT\",\"reservationId\":\"$RES_ID\"}")
    echo "$PAY_RESP" | grep -q '"ok":true' && check "晒场保证金支付" "ok" "ok" || check "晒场保证金支付" "ok" "fail ($PAY_RESP)"
  else
    check "晒场预约" "ok" "fail ($DRY_RESP)"
  fi
else
  echo "✗ 晒场预约 (no OPERATING listing)"
  FAIL=$((FAIL+1))
fi

ORG_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const o = await p.organization.findFirst({ where: { code: 'REG61' } });
  console.log(o?.id || '');
}
main().finally(() => p.\$disconnect());
" 2>/dev/null)
ASSET_RESP=$(curl -s -b /tmp/ft_admin.txt -X POST "$BASE/api/admin/assets" \
  -F "orgId=$ORG_ID" -F "type=LAND" -F "name=冒烟测试资产" -F "locationText=测试地点")
echo "$ASSET_RESP" | grep -q '"ok":true' && check "管理员创建资产" "ok" "ok" || check "管理员创建资产" "ok" "fail ($ASSET_RESP)"

echo ""
echo "通过: $PASS  失败: $FAIL"
[ "$FAIL" -eq 0 ]
