#!/usr/bin/env bash
# API 冒烟测试：需 dev server 运行于 BASE_URL（默认 http://localhost:3000）
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expected, got $actual)"
    [ -n "$body" ] && echo "  body: ${body:0:300}"
    FAIL=$((FAIL + 1))
  fi
}

json_post() {
  local url="$1" data="$2" jar="$3"
  curl -s -w "\n%{http_code}" -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$data" -b "$jar" -c "$jar"
}

# 页面可达
for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# 管理员登录
resp=$(json_post "$BASE/api/auth/admin/login" '{"phone":"13900000001","password":"admin123"}' "$ADMIN_JAR")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
check "POST admin login" "200" "$code" "$body"

# 用户登录
resp=$(json_post "$BASE/api/auth/login" '{"phone":"13800138000","password":"user123"}' "$COOKIE_JAR")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
check "POST user login" "200" "$code" "$body"

# 第三方 token（开发）
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke-test")
check "GET third-party-token" "200" "$code"

# 管理后台（已登录）
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
check "GET /admin (authenticated)" "200" "$code"

# 演示竞拍出价
read -r PROJECT_ID MIN_BID STATUS <<< "$(npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const demo = await p.endUser.findUnique({ where: { phone: '13800138000' } });
  const reg = demo
    ? await p.auctionRegistration.findFirst({
        where: { endUserId: demo.id, status: 'APPROVED', depositPaid: true },
        orderBy: { createdAt: 'desc' },
      })
    : null;
  const proj = reg
    ? await p.auctionProject.findUnique({ where: { id: reg.projectId } })
    : await p.auctionProject.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!proj) { console.log(''); await p.\$disconnect(); return; }
  const top = await p.auctionBid.findFirst({
    where: { projectId: proj.id },
    orderBy: { amount: 'desc' },
  });
  const min = top
    ? Number(top.amount) + Number(proj.bidStep)
    : Number(proj.startPrice);
  console.log(proj.id + ' ' + min + ' ' + proj.status);
  await p.\$disconnect();
})();
" 2>/dev/null)"

check "demo auction LIVE" "LIVE" "${STATUS:-ENDED}"

if [ -n "${PROJECT_ID:-}" ] && [ -n "${MIN_BID:-}" ]; then
  resp=$(json_post "$BASE/api/m/auction/$PROJECT_ID/bid" "{\"amount\":$MIN_BID}" "$COOKIE_JAR")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')
  check "POST bid" "200" "$code" "$body"
fi

# 晒场预约
read -r LISTING_ID <<< "$(npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const r = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(r?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)"

if [ -n "${LISTING_ID:-}" ]; then
  START=$(date -u -d "+3 days" +%Y-%m-%d)
  END=$(date -u -d "+4 days" +%Y-%m-%d)
  resp=$(json_post "$BASE/api/m/drying/reserve" \
    "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}" \
    "$COOKIE_JAR")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')
  check "POST drying reserve" "200" "$code" "$body"
fi

# 数据字典
DICT_COUNT=$(npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  console.log(await p.dictCategory.count());
  await p.\$disconnect();
})();
" 2>/dev/null)
if [ "${DICT_COUNT:-0}" -ge 14 ]; then
  check "dict seeded" "ok" "ok"
else
  echo "FAIL: dict not seeded (count=${DICT_COUNT:-0})"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
