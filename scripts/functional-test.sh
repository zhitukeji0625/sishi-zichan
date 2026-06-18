#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== 功能完整性测试 ($BASE) ==="

# 刷新演示竞拍为 LIVE
npx tsx prisma/seed.ts >/dev/null 2>&1 || true

# 1. 首页
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "首页" "200" "$code"

# 2. 移动端首页
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
check "移动端首页" "200" "$code"

# 3. 管理后台登录页
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check "管理后台登录页" "200" "$code"

# 4. 用户登录
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
check "用户登录" "200" "$code"

# 5. 未登录出价应 401
PROJECT_ID=$(npx tsx -e "import{PrismaClient as P}from'@prisma/client';const p=new P();p.auctionProject.findFirst({orderBy:{createdAt:'desc'}}).then(r=>{console.log(r?.id??'');p.\$disconnect()})" 2>/dev/null | tail -1)
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
  -H "Content-Type: application/json" -d '{"amount":8200}')
check "未登录出价 401" "401" "$code"

# 6. 竞拍出价（需 LIVE 状态，金额动态计算）
BID_AMOUNT=$(npx tsx <<'SCRIPT' 2>/dev/null | tail -1
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
const p = new PrismaClient();
async function main() {
  const project = await p.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
  if (!project) { console.log("8200"); return; }
  const top = await p.auctionBid.findFirst({
    where: { projectId: project.id },
    orderBy: { amount: "desc" },
  });
  const min = top
    ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
    : new Decimal(project.startPrice.toString());
  console.log(min.toFixed(2));
}
main().finally(() => p.$disconnect());
SCRIPT
)
resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
  -H "Content-Type: application/json" -d "{\"amount\":$BID_AMOUNT}")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
if [[ "$code" == "200" ]]; then
  check "竞拍出价" "200" "$code"
else
  echo "  ✗ 竞拍出价 (expected 200, got $code) body=$body"
  FAIL=$((FAIL + 1))
fi

# 7. 晒场预约
LISTING_ID=$(npx tsx -e "import{PrismaClient as P}from'@prisma/client';const p=new P();p.dryingFieldListing.findFirst().then(r=>{console.log(r?.id??'');p.\$disconnect()})" 2>/dev/null | tail -1)
START=$(date -u -d "+2 days" +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
END=$(date -u -d "+3 days" +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
if [[ "$code" == "200" ]]; then
  check "晒场预约" "200" "$code"
else
  echo "  ✗ 晒场预约 (expected 200, got $code) body=$body"
  FAIL=$((FAIL + 1))
fi

# 8. 管理员登录
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
check "管理员登录" "200" "$code"

# 9. 上传非 multipart 应 400（非 500）
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
check "上传非 multipart 400" "400" "$code"

# 10. 管理后台资产 API 非 multipart 应 400
ORG_ID=$(npx tsx -e "import{PrismaClient as P}from'@prisma/client';const p=new P();p.organization.findFirst({where:{level:'DIVISION'}}).then(r=>{console.log(r?.id??'');p.\$disconnect()})" 2>/dev/null | tail -1)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d "{\"orgId\":\"$ORG_ID\",\"type\":\"LAND\",\"name\":\"test\",\"locationText\":\"test\"}")
check "资产 API 非 multipart 400" "400" "$code"

# 11. 第三方 token（开发环境默认可用；生产需 ALLOW_DEV_ROUTES=true）
if [ "${NODE_ENV:-development}" != "production" ] || [ "${ALLOW_DEV_ROUTES:-false}" = "true" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-user")
  check "第三方 token" "200" "$code"
else
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-user")
  check "第三方 token (disabled)" "404" "$code"
fi

# 12. favicon（跟随重定向至 /icon）
code=$(curl -sL -o /dev/null -w "%{http_code}" "$BASE/favicon.ico")
check "favicon" "200" "$code"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[[ "$FAIL" -eq 0 ]]
