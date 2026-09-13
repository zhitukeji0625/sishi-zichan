#!/bin/bash
set -euo pipefail
BASE="http://localhost:3000"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/smoke-cookies.txt"
rm -f "$COOKIE_JAR"

check() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "✗ $name (expected $expected, got $actual) body=$body"
    FAIL=$((FAIL+1))
  fi
}

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "首页" "200" "$code"

# 2. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check "管理端登录页" "200" "$code"

# 3. Mobile login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")
check "移动端登录页" "200" "$code"

# 4. Admin login API
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check "管理员登录" "200" "$code" "$body"

# 5. Admin assets list page (authenticated)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/admin/assets")
check "管理端资产页" "200" "$code"

# 6. Upload without multipart (should be 400 not 500)
code=$(curl -s -o /tmp/upload-resp.txt -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"file":"test"}')
body=$(cat /tmp/upload-resp.txt)
check "上传非multipart返回400" "400" "$code" "$body"

# 7. Admin assets without multipart (should be 400 not 500)
code=$(curl -s -o /tmp/asset-resp.txt -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"test"}')
body=$(cat /tmp/asset-resp.txt)
check "资产API非multipart返回400" "400" "$code" "$body"

# 8. Admin logout
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/logout")
check "管理员登出" "200" "$code"

# 9. User login
rm -f "$COOKIE_JAR"
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check "用户登录" "200" "$code" "$body"

# 10. Mobile auction page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")
check "移动端竞拍列表" "200" "$code"

# 11. Get LIVE project from DB
PROJECT_ID=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } })
  .then(r => { console.log(r?.id || ''); return p.\$disconnect(); })
" 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  echo "✗ 无LIVE竞拍项目"
  FAIL=$((FAIL+1))
else
  echo "✓ 找到LIVE项目 $PROJECT_ID"
  PASS=$((PASS+1))
  
  # 12. Bid - get min bid
  MIN_BID=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } });
  if (!proj) { console.log('0'); return; }
  const top = proj.bids[0]?.amount;
  const min = top ? Number(top) + Number(proj.bidStep) : Number(proj.startPrice);
  console.log(min);
}
main().finally(() => p.\$disconnect());
" 2>/dev/null)
  
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  check "用户出价" "200" "$code" "$body"
fi

# 13. Drying reserve
LISTING_ID=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } })
  .then(r => { console.log(r?.id || ''); return p.\$disconnect(); })
" 2>/dev/null)
if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  check "晒场预约" "200" "$code" "$body"
else
  echo "✗ 无运营晒场"
  FAIL=$((FAIL+1))
fi

# 14. Register new user
PHONE="199$(date +%s | tail -c 9)"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check "用户注册" "200" "$code" "$body"

# 15. Third party token (dev)
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-smoke")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
check "第三方Token" "200" "$code" "$body"

# 16. Mobile drying page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying")
check "移动端晒场页" "200" "$code"

# 17. Unauthenticated upload
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
check "未登录上传返回401" "401" "$code"

# 18. Unauthenticated bid
if [ -n "$PROJECT_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":99999}')
  check "未登录出价返回401" "401" "$code"
fi

echo ""
echo "=== 结果: $PASS 通过, $FAIL 失败 ==="
exit $FAIL
