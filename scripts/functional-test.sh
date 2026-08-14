#!/usr/bin/env bash
# 功能完整性测试（需 dev 服务器运行于 localhost:3000）
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ERRORS=()

pass() { echo "✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "✗ $1"; ERRORS+=("$1"); FAIL=$((FAIL + 1)); }

echo "=== 功能完整性测试 ($BASE) ==="

# 页面可达性
for path in / /admin/login /m /m/login /m/register /m/auction /m/drying; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE$path")
  if [[ "$code" == "200" ]]; then pass "GET $path ($code)"; else fail "GET $path ($code)"; fi
done

# 登录
curl -s -c /tmp/ft_admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' | grep -qE '"ok"|redirect' && pass "Admin login" || fail "Admin login"
curl -s -c /tmp/ft_user.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' | grep -qE '"ok"|redirect' && pass "User login" || fail "User login"

# 认证后页面
for path in /admin /admin/assets /admin/auctions /m/me /m/orders; do
  cookie=/tmp/ft_admin.txt
  [[ "$path" == /m/* ]] && cookie=/tmp/ft_user.txt
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$cookie" -L "$BASE$path")
  if [[ "$code" == "200" ]]; then pass "Auth GET $path ($code)"; else fail "Auth GET $path ($code)"; fi
done

# 第三方 token（仅 dev）
curl -s "$BASE/api/dev/third-party-token?u_id=ft_test" | grep -q token && pass "Third-party token" || fail "Third-party token"

# 无效登录
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"000","password":"x"}')
[[ "$code" == "401" || "$code" == "400" ]] && pass "Invalid login rejected ($code)" || fail "Invalid login ($code)"

# 竞拍出价（需 LIVE 演示竞拍）
PROJECT_ID=$(cd "$(dirname "$0")/.." && node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.auctionProject.findFirst({ where: { code: 'DEMO_LIVE_AUCTION' } })
    .then(r => { console.log(r?.id || ''); return p.\$disconnect(); });
")
if [[ -n "$PROJECT_ID" ]]; then
  BID_AMOUNT=$(cd "$(dirname "$0")/.." && node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    (async () => {
      const project = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
      const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
      const min = top
        ? Number(top.amount) + Number(project.bidStep)
        : Number(project.startPrice);
      console.log(min);
      await p.\$disconnect();
    })();
  ")
  code=$(curl -s -o /tmp/ft_bid.json -w "%{http_code}" -b /tmp/ft_user.txt \
    -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$BID_AMOUNT}")
  if [[ "$code" == "200" ]]; then pass "Bid on LIVE auction ($code, amount=$BID_AMOUNT)"; else fail "Bid on LIVE auction ($code): $(cat /tmp/ft_bid.json)"; fi
else
  fail "No DEMO_LIVE_AUCTION project found"
fi

# 晒场预约 maxAdvanceDays 校验
LISTING_ID=$(cd "$(dirname "$0")/.." && node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.dryingFieldListing.findFirst()
    .then(r => { console.log(r?.id || ''); return p.\$disconnect(); });
")
if [[ -n "$LISTING_ID" ]]; then
  FAR=$(date -d "+30 days" +%Y-%m-%d 2>/dev/null || date -v+30d +%Y-%m-%d)
  body=$(curl -s -b /tmp/ft_user.txt -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$FAR\",\"endDate\":\"$FAR\"}")
  echo "$body" | grep -q "天内" && pass "maxAdvanceDays server validation" || fail "maxAdvanceDays validation: $body"
fi

echo ""
echo "=== 结果: $PASS 通过, $FAIL 失败 ==="
if [[ $FAIL -gt 0 ]]; then
  for e in "${ERRORS[@]}"; do echo "  - $e"; done
  exit 1
fi
