#!/usr/bin/env bash
# 冒烟功能测试：需 dev server 已启动 (npm run dev)
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0; FAIL=0

check() {
  local name="$1" expect="$2" actual="$3"
  if [ "$actual" = "$expect" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "✗ $name expected=$expect got=$actual"
    FAIL=$((FAIL+1))
  fi
}

check_json() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -qE "$pattern"; then
    echo "✓ $name"
    PASS=$((PASS+1))
  else
    echo "✗ $name (body: $body)"
    FAIL=$((FAIL+1))
  fi
}

# --- 公开页面 ---
for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# --- 管理员登录 ---
ADMIN_COOKIE=$(mktemp)
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check "POST admin login" "200" "$code"

for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/dict"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE$path")
  check "GET $path (admin)" "200" "$code"
done

# --- 用户登录 ---
USER_COOKIE=$(mktemp)
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check "POST user login" "200" "$code"

for path in "/m/me" "/m/orders"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" "$BASE$path")
  check "GET $path (user)" "200" "$code"
done

# --- 未登录保护 ---
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/test/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
check "POST bid without auth" "401" "$code"

# --- 第三方 token ---
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=testuser")
check "GET dev third-party-token" "200" "$code"

# --- 竞拍出价（需 LIVE 项目）---
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true, startPrice: true, bidStep: true } });
  if (!proj) { console.log(''); process.exit(0); }
  const top = await p.auctionBid.findFirst({ where: { projectId: proj.id }, orderBy: { amount: 'desc' }, select: { amount: true } });
  const min = top ? Number(top.amount) + Number(proj.bidStep) : Number(proj.startPrice);
  console.log(proj.id + ' ' + min);
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  PID=$(echo "$PROJECT_ID" | awk '{print $1}')
  AMOUNT=$(echo "$PROJECT_ID" | awk '{print $2}')
  body=$(curl -s -X POST "$BASE/api/m/auction/$PID/bid" -b "$USER_COOKIE" \
    -H "Content-Type: application/json" -d "{\"amount\":$AMOUNT}")
  check_json "POST bid on LIVE auction" '"ok":true' "$body"
else
  echo "⚠ skip bid test: no LIVE auction"
fi

# --- 晒场预约 ---
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [ -n "$LISTING_ID" ]; then
  START=$(date -u -d "+3 days" +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
  END=$(date -u -d "+4 days" +%Y-%m-%d 2>/dev/null || date -u -v+4d +%Y-%m-%d)
  body=$(curl -s -X POST "$BASE/api/m/drying/reserve" -b "$USER_COOKIE" \
    -H "Content-Type: application/json" -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check_json "POST drying reserve" '"ok":true' "$body"
fi

echo "--- Results: $PASS passed, $FAIL failed ---"
exit $FAIL
