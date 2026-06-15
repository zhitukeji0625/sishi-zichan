#!/usr/bin/env bash
# API 功能冒烟测试（需服务运行在 BASE_URL，默认 http://localhost:3000）
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/ft-user.txt"
ADMIN_JAR="/tmp/ft-admin.txt"
FAIL=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1 — $2"; FAIL=1; }

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

# 1. 页面可达
for path in / /admin/login /m /m/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path"; else fail "GET $path" "status $code"; fi
done

# 2. favicon 不 404
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/favicon.ico")
if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "308" ]; then pass "favicon"; else fail "favicon" "status $code"; fi

# 3. 用户登录
resp=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
echo "$resp" | grep -q '"ok":true' && pass "user login" || fail "user login" "$resp"

# 4. 管理员登录
resp=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
echo "$resp" | grep -q '"ok":true' && pass "admin login" || fail "admin login" "$resp"

# 5. 未登录出价被拒
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" -H "Content-Type: application/json" -d '{"amount":100}')
[ "$code" = "401" ] && pass "bid requires auth" || fail "bid requires auth" "status $code"

# 6. 竞拍出价（需 LIVE 项目）
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
(async () => {
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } });
  console.log(proj?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)
if [ -n "$PROJECT_ID" ]; then
  min=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { getHighestBid } from './src/lib/auction';
(async () => {
  const p = new PrismaClient();
  const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
  const top = await getHighestBid('$PROJECT_ID');
  const min = top ? Number(top) + Number(proj!.bidStep) : Number(proj!.startPrice);
  console.log(min);
  await p.\$disconnect();
})();
" 2>/dev/null)
  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H "Content-Type: application/json" -d "{\"amount\":$min}")
  echo "$resp" | grep -q '"ok":true' && pass "place bid" || fail "place bid" "$resp"
else
  fail "place bid" "no LIVE project"
fi

# 7. 晒场预约
DRYING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
(async () => {
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)
if [ -n "$DRYING_ID" ]; then
  START=$(date -d "+2 days" +%Y-%m-%d 2>/dev/null || date -v+2d +%Y-%m-%d)
  END=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d "{\"listingId\":\"$DRYING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  echo "$resp" | grep -q '"ok":true' && pass "drying reserve" || fail "drying reserve" "$resp"
else
  fail "drying reserve" "no listing"
fi

# 8. multipart 校验（应 400 而非 500）
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')
[ "$code" = "400" ] && pass "upload rejects non-multipart" || fail "upload rejects non-multipart" "status $code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{}')
[ "$code" = "400" ] && pass "assets rejects non-multipart" || fail "assets rejects non-multipart" "status $code"

# 9. 第三方 SSO
resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=ft_test")
TOKEN=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)
if [ -n "$TOKEN" ]; then
  resp=$(curl -s -X POST "$BASE/api/auth/third-party" -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
  echo "$resp" | grep -q '"ok":true' && pass "third-party auth" || fail "third-party auth" "$resp"
else
  fail "third-party auth" "no token"
fi

# 10. 登出
resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
echo "$resp" | grep -q '"ok":true' && pass "logout" || fail "logout" "$resp"

echo "---"
if [ "$FAIL" -eq 0 ]; then echo "All functional tests passed."; else echo "Some tests failed."; fi
exit $FAIL
