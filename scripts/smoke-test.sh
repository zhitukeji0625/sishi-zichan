#!/usr/bin/env bash
# 关键 API 冒烟测试（需 dev server + 已 seed 的数据库）
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

fail=0
check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: $name (expected HTTP $expected, got $actual)"
    fail=1
  else
    echo "OK: $name"
  fi
}

# 首页
check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"

# 管理端登录
ADMIN_BODY=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
check "POST admin login" 200 "$(curl -s -o /dev/null -w '%{http_code}' -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')"
echo "$ADMIN_BODY" | grep -q '"ok":true' || { echo "FAIL: admin login body"; fail=1; }

# 用户登录
USER_BODY=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
check "POST user login" 200 "$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')"
echo "$USER_BODY" | grep -q '"ok":true' || { echo "FAIL: user login body"; fail=1; }

# 获取 LIVE 竞拍项目 ID
PROJECT_ID=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
  console.log(proj?.id ?? '');
  await p.\$disconnect();
})().catch(() => process.exit(1));
" 2>/dev/null)

if [[ -z "$PROJECT_ID" ]]; then
  echo "SKIP: no LIVE auction project"
else
  BID_AMOUNT=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
const p = new PrismaClient();
(async () => {
  const project = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
  if (!project) { console.log(''); return; }
  const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
  const min = top
    ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
    : new Decimal(project.startPrice.toString());
  console.log(min.toFixed(2));
  await p.\$disconnect();
})().catch(() => process.exit(1));
" 2>/dev/null)
  BID_CODE=$(curl -s -o /tmp/bid.json -w '%{http_code}' -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' \
    -d "{\"amount\":$BID_AMOUNT}")
  if [[ "$BID_CODE" == "200" ]]; then
    echo "OK: auction bid"
  else
    cat /tmp/bid.json
    echo "FAIL: auction bid HTTP $BID_CODE"
    fail=1
  fi
fi

# 晒场预约
LISTING_ID=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
})().catch(() => process.exit(1));
" 2>/dev/null)

if [[ -n "$LISTING_ID" ]]; then
  RES_CODE=$(curl -s -o /tmp/reserve.json -w '%{http_code}' -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-06-01\",\"endDate\":\"2026-06-03\"}")
  if [[ "$RES_CODE" == "200" ]]; then
    echo "OK: drying reserve"
  else
    cat /tmp/reserve.json
    echo "FAIL: drying reserve HTTP $RES_CODE"
    fail=1
  fi
fi

# 第三方 token（dev）
TP_TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=ext-smoke-001" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || true)
if [[ -n "$TP_TOKEN" ]]; then
  TP_CODE=$(curl -s -o /tmp/tp.json -w '%{http_code}' -X POST "$BASE/api/auth/third-party" \
    -H 'Content-Type: application/json' \
    -d "{\"token\":\"$TP_TOKEN\"}")
  check "POST third-party auth" 200 "$TP_CODE"
else
  echo "SKIP: third-party token"
fi

# 管理端页面（需 cookie）
check "GET /admin" 200 "$(curl -s -o /dev/null -w '%{http_code}' -c "$ADMIN_JAR" -b "$ADMIN_JAR" "$BASE/admin")"

exit "$fail"
