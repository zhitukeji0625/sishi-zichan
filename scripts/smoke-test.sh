#!/usr/bin/env bash
# 端到端冒烟测试：要求 MariaDB 已启动且 dev server 运行在 BASE_URL
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_PHONE="13900000001"
ADMIN_PASS="admin123"
USER_PHONE="13800138000"
USER_PASS="user123"
PASS=0
FAIL=0

ok() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

check_http() {
  local label="$1" url="$2" expect="${3:-200}" cookies="${4:-}"
  local code
  if [ -n "$cookies" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -b "$cookies" "$url")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  fi
  if [ "$code" = "$expect" ]; then ok "$label ($code)"; else bad "$label (got $code, want $expect)"; fi
}

echo "=== Smoke test @ $BASE_URL ==="

# 1. 公开页面
for path in "/" "/admin/login" "/m" "/m/login" "/m/auction" "/m/drying"; do
  check_http "GET $path" "$BASE_URL$path"
done

# 2. 管理员登录
ADMIN_COOKIE=$(mktemp)
ADMIN_RES=$(curl -s -c "$ADMIN_COOKIE" -X POST "$BASE_URL/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$ADMIN_PHONE\",\"password\":\"$ADMIN_PASS\"}")
if echo "$ADMIN_RES" | grep -q '"ok":true'; then ok "admin login API"; else bad "admin login API: $ADMIN_RES"; fi

for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/dict"; do
  check_http "GET $path" "$BASE_URL$path" 200 "$ADMIN_COOKIE"
done

# 3. 数据字典
DICT_COUNT=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dictCategory.count().then(n => { console.log(n); return p.\$disconnect(); });
" 2>/dev/null || echo "0")
if [ "${DICT_COUNT:-0}" -gt 0 ]; then ok "dict categories seeded ($DICT_COUNT)"; else bad "dict categories missing (run npm run db:seed)"; fi

# 4. 用户登录
USER_COOKIE=$(mktemp)
USER_RES=$(curl -s -c "$USER_COOKIE" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$USER_PHONE\",\"password\":\"$USER_PASS\"}")
if echo "$USER_RES" | grep -q '"ok":true'; then ok "user login API"; else bad "user login API: $USER_RES"; fi

for path in "/m/me" "/m/orders"; do
  check_http "GET $path" "$BASE_URL$path" 200 "$USER_COOKIE"
done

# 5. 竞拍出价（动态查询 LIVE 项目）
BID_INFO=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const user = await p.endUser.findUnique({ where: { phone: '$USER_PHONE' } });
  const reg = await p.auctionRegistration.findFirst({
    where: { endUserId: user!.id, status: 'APPROVED', depositPaid: true, project: { status: 'LIVE' } },
    include: { project: true },
  });
  if (!reg) { console.log('SKIP'); return; }
  const top = await p.auctionBid.findFirst({ where: { projectId: reg.projectId }, orderBy: { amount: 'desc' } });
  const min = top
    ? Number(top.amount) + Number(reg.project.bidStep)
    : Number(reg.project.startPrice);
  console.log(reg.projectId + ' ' + min);
  await p.\$disconnect();
})();
" 2>/dev/null || echo "SKIP")

if [ "$BID_INFO" = "SKIP" ] || [ -z "$BID_INFO" ]; then
  bad "no LIVE auction for demo user to bid"
else
  PROJECT_ID=$(echo "$BID_INFO" | awk '{print $1}')
  MIN_BID=$(echo "$BID_INFO" | awk '{print $2}')
  BID_RES=$(curl -s -b "$USER_COOKIE" -X POST "$BASE_URL/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  if echo "$BID_RES" | grep -q '"ok":true'; then ok "auction bid API (¥$MIN_BID)"; else bad "auction bid API: $BID_RES"; fi
fi

# 6. 晒场预约
LISTING_ID=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(l => { console.log(l?.id ?? ''); return p.\$disconnect(); });
" 2>/dev/null || echo "")
if [ -n "$LISTING_ID" ]; then
  START=$(date -u -d "+2 days" +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  END=$(date -u -d "+4 days" +%Y-%m-%d 2>/dev/null || date -u -v+4d +%Y-%m-%d)
  RESERVE_RES=$(curl -s -b "$USER_COOKIE" -X POST "$BASE_URL/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  if echo "$RESERVE_RES" | grep -q '"ok":true'; then ok "drying reserve API"; else bad "drying reserve API: $RESERVE_RES"; fi
else
  bad "no operating drying listing"
fi

# 7. 第三方 token
TP_RES=$(curl -s "$BASE_URL/api/dev/third-party-token?u_id=smoke_test")
if echo "$TP_RES" | grep -q '"token"'; then ok "third-party token API"; else bad "third-party token API: $TP_RES"; fi

rm -f "$ADMIN_COOKIE" "$USER_COOKIE"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
