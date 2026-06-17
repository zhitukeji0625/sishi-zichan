#!/usr/bin/env bash
# 冒烟测试：需先启动 npm run dev 与 MariaDB
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
USER_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$USER_JAR" "$ADMIN_JAR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_bool() {
  local name="$1" json="$2"
  local ok
  ok=$(echo "$json" | python3 -c "import sys,json; print(str(json.load(sys.stdin).get('ok', False)).lower())" 2>/dev/null || echo "false")
  check "$name" "true" "$ok"
}

# 页面
check "home" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")"
check "m portal" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")"
check "admin login" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")"
check "favicon" "200" "$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/favicon.ico")"

# 鉴权
check "admin redirect" "307" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")"
check "api/m without auth" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/x/bid" -H "Content-Type: application/json" -d '{"amount":100}')"

# 登录
ULOGIN=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check_bool "user login" "$ULOGIN"

ALOGIN=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check_bool "admin login" "$ALOGIN"

# multipart 校验
check "upload no multipart" "400" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" -b "$ADMIN_JAR" -H "Content-Type: application/json" -d '{}')"

# 竞拍出价
PROJECT_ID=$(npx tsx scripts/check-db.ts 2>/dev/null | python3 -c "
import sys, json, re
text = sys.stdin.read()
m = re.search(r'\"status\": \"LIVE\"[^}]*\"id\": \"([^\"]+)\"', text)
if not m:
    m = re.search(r'\"id\": \"([^\"]+)\"[^}]*\"status\": \"LIVE\"', text)
print(m.group(1) if m else '')
" 2>/dev/null || true)

if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } })
  .then((x) => { console.log(x?.id ?? ''); return p.\$disconnect(); });
")
fi

if [ -n "$PROJECT_ID" ]; then
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('@prisma/client/runtime/library');
const p = new PrismaClient();
(async () => {
  const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
  const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
  const min = top ? new Decimal(top.amount.toString()).plus(proj.bidStep.toString()) : new Decimal(proj.startPrice.toString());
  console.log(min.toFixed(2));
  await p.\$disconnect();
})();
")
  BID=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H "Content-Type: application/json" -d "{\"amount\": $MIN_BID}")
  check_bool "auction bid" "$BID"
else
  echo "FAIL: no LIVE auction project"
  FAIL=$((FAIL + 1))
fi

# 晒场预约
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } })
  .then((x) => { console.log(x?.id ?? ''); return p.\$disconnect(); });
")

if [ -n "$LISTING_ID" ]; then
  TOMORROW=$(date -d "+2 days" +%Y-%m-%d 2>/dev/null || date -v+2d +%Y-%m-%d)
  DRY=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$TOMORROW\",\"endDate\":\"$TOMORROW\"}")
  check_bool "drying reserve" "$DRY"
else
  echo "FAIL: no drying listing"
  FAIL=$((FAIL + 1))
fi

check "dev token" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test123")"
check "m auction page" "200" "$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" "$BASE/m/auction")"
check "m drying page" "200" "$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" "$BASE/m/drying")"
check "m me page" "200" "$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" "$BASE/m/me")"

echo "---"
echo "PASSED: $PASS  FAILED: $FAIL"
exit "$FAIL"
