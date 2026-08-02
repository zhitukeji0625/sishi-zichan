#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  OK  $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('ok') else 1)" 2>/dev/null; then
    echo "  OK  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== 页面 smoke 测试 ==="
for path in / /m /admin/login /m/login /m/register; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "$path" "200" "$code"
done

echo "=== 管理员登录 ==="
curl -s -c /tmp/ft_admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' > /tmp/ft_admin_resp.json
assert_json_ok "admin login" "$(cat /tmp/ft_admin_resp.json)"

echo "=== 用户登录 ==="
curl -s -c /tmp/ft_user.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' > /tmp/ft_user_resp.json
assert_json_ok "user login" "$(cat /tmp/ft_user_resp.json)"

echo "=== 管理后台页面 ==="
for path in /admin /admin/assets /admin/auctions /admin/organizations /admin/registrations \
  /admin/drying /admin/announcements /admin/admins /admin/audit /admin/config /admin/dict; do
  code=$(curl -s -b /tmp/ft_admin.txt -L -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "$path" "200" "$code"
done

echo "=== 用户端页面 ==="
for path in /m/auction /m/me /m/orders /m/drying; do
  code=$(curl -s -b /tmp/ft_user.txt -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "$path" "200" "$code"
done

echo "=== API 错误处理（无 multipart 应返回 400）==="
for ep in /api/upload /api/admin/assets; do
  code=$(curl -s -b /tmp/ft_admin.txt -X POST "$BASE$ep" -o /dev/null -w "%{http_code}")
  assert_status "POST $ep (no body)" "400" "$code"
done
ASSET_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.asset.findFirst().then(a => { console.log(a?.id ?? ''); p.\$disconnect(); });
" 2>/dev/null)
if [[ -n "$ASSET_ID" ]]; then
  code=$(curl -s -b /tmp/ft_admin.txt -X POST "$BASE/api/admin/assets/$ASSET_ID" -o /dev/null -w "%{http_code}")
  assert_status "POST /api/admin/assets/[id] (no body)" "400" "$code"
fi

echo "=== 竞拍状态重置与出价 ==="
cd "$(dirname "$0")/.."
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.updateMany({
  where: { status: 'ENDED' },
  data: { status: 'LIVE', startsAt: new Date(Date.now()-60000), endsAt: new Date(Date.now()+7*86400000) }
}).then(() => p.\$disconnect());
" > /dev/null 2>&1

PROJECT_ID=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' } }).then(pr => { console.log(pr?.id ?? ''); p.\$disconnect(); });
" 2>/dev/null)

if [[ -n "$PROJECT_ID" ]]; then
  BID_INFO=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
const p = new PrismaClient();
async function main() {
  const pr = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
  const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
  const min = top ? new Decimal(top.amount.toString()).add(pr!.bidStep) : pr!.startPrice;
  console.log(min.toString());
}
main().finally(() => p.\$disconnect());
" 2>/dev/null)
  BID_RESP=$(curl -s -b /tmp/ft_user.txt -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\": $BID_INFO}")
  assert_json_ok "auction bid" "$BID_RESP"
fi

echo "=== 晒场预约 ==="
LISTING_ID=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } }).then(l => { console.log(l?.id ?? ''); p.\$disconnect(); });
" 2>/dev/null)
if [[ -n "$LISTING_ID" ]]; then
  DRY_RESP=$(curl -s -b /tmp/ft_user.txt -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-09-01\",\"endDate\":\"2026-09-03\"}")
  assert_json_ok "drying reserve" "$DRY_RESP"
fi

echo "=== 第三方 SSO ==="
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=ft_test_user" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
SSO_RESP=$(curl -s -c /tmp/ft_sso.txt -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
assert_json_ok "third-party SSO" "$SSO_RESP"

echo ""
echo "=== 结果: $PASS 通过, $FAIL 失败 ==="
[[ "$FAIL" -eq 0 ]]
