#!/usr/bin/env bash
# 冒烟测试：核心 API 与页面可达性
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local code="$2"
  local expect="${3:-200}"
  if [[ "$code" == "$expect" ]]; then
    echo "  OK  $name ($code)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (got $code, want $expect)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test @ $BASE ==="

# Pages
check "首页" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "移动端首页" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "竞拍列表" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check "晒场列表" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"
check "管理登录页" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

# User login
curl -s -c /tmp/smoke-user.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' > /tmp/smoke-user.json
USER_OK=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/smoke-user.json','utf8')).ok?'yes':'no')" 2>/dev/null || echo "no")
if [[ "$USER_OK" == "yes" ]]; then
  echo "  OK  用户登录"
  PASS=$((PASS + 1))
else
  echo "  FAIL 用户登录"
  FAIL=$((FAIL + 1))
fi

# Admin login (must use admin endpoint)
curl -s -c /tmp/smoke-admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' > /tmp/smoke-admin.json
ADMIN_OK=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/smoke-admin.json','utf8')).ok?'yes':'no')" 2>/dev/null || echo "no")
if [[ "$ADMIN_OK" == "yes" ]]; then
  echo "  OK  管理员登录"
  PASS=$((PASS + 1))
else
  echo "  FAIL 管理员登录"
  FAIL=$((FAIL + 1))
fi

# Admin dict page
check "数据字典页" "$(curl -s -L -o /dev/null -w '%{http_code}' -b /tmp/smoke-admin.txt "$BASE/admin/dict")"
check "资产列表页" "$(curl -s -L -o /dev/null -w '%{http_code}' -b /tmp/smoke-admin.txt "$BASE/admin/assets")"

# Auction bid (dynamic min amount)
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ orderBy: { createdAt: 'desc' } })
  .then(a => { if (!a) process.exit(1); console.log(a.id); })
  .finally(() => p.\$disconnect());
" 2>/dev/null || echo "")

if [[ -n "$PROJECT_ID" ]]; then
  BID_AMOUNT=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
const p = new PrismaClient();
async function main() {
  const project = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
  if (!project) return;
  const top = await p.auctionBid.findFirst({ where: { projectId: project.id }, orderBy: { amount: 'desc' } });
  const min = top
    ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
    : new Decimal(project.startPrice.toString());
  console.log(min.toFixed(2));
}
main().finally(() => p.\$disconnect());
" 2>/dev/null || echo "8200")

  BID_RES=$(curl -s -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -b /tmp/smoke-user.txt \
    -d "{\"amount\":$BID_AMOUNT}")
  BID_OK=$(node -e "console.log(JSON.parse(process.argv[1]).ok?'yes':'no')" "$BID_RES" 2>/dev/null || echo "no")
  if [[ "$BID_OK" == "yes" ]]; then
    echo "  OK  竞拍出价 ($BID_AMOUNT)"
    PASS=$((PASS + 1))
  else
    ERR=$(node -e "console.log(JSON.parse(process.argv[1]).error||'unknown')" "$BID_RES" 2>/dev/null || echo "unknown")
    echo "  FAIL 竞拍出价: $ERR"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  FAIL 无竞拍项目"
  FAIL=$((FAIL + 1))
fi

# Drying reservation
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst().then(a => console.log(a?.id ?? '')).finally(() => p.\$disconnect());
" 2>/dev/null || echo "")

if [[ -n "$LISTING_ID" ]]; then
  DRY_RES=$(curl -s -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -b /tmp/smoke-user.txt \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-09-01\",\"endDate\":\"2026-09-02\"}")
  DRY_OK=$(node -e "console.log(JSON.parse(process.argv[1]).ok?'yes':'no')" "$DRY_RES" 2>/dev/null || echo "no")
  if [[ "$DRY_OK" == "yes" ]]; then
    echo "  OK  晒场预约"
    PASS=$((PASS + 1))
  else
    ERR=$(node -e "console.log(JSON.parse(process.argv[1]).error||'unknown')" "$DRY_RES" 2>/dev/null || echo "unknown")
    echo "  FAIL 晒场预约: $ERR"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  FAIL 无晒场 listing"
  FAIL=$((FAIL + 1))
fi

# Dict data in DB
DICT_COUNT=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dictCategory.count().then(c => console.log(c)).finally(() => p.\$disconnect());
" 2>/dev/null || echo "0")
if [[ "$DICT_COUNT" -gt 0 ]]; then
  echo "  OK  字典分类 ($DICT_COUNT)"
  PASS=$((PASS + 1))
else
  echo "  FAIL 字典分类为空"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Result: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
