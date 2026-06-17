#!/usr/bin/env bash
# 功能冒烟测试：页面可达性、鉴权、登录、multipart、竞拍、晒场
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$ADMIN_JAR" "$USER_JAR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_contains() {
  local name="$1" haystack="$2" needle="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (missing: $needle)"
    FAIL=$((FAIL + 1))
  fi
}

# --- 公开页面 ---
for path in "/" "/m" "/m/auction" "/m/drying" "/m/login" "/m/register" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# favicon 重定向
code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/favicon.ico")
check "GET /favicon.ico" "200" "$code"

# --- 鉴权 ---
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/x/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
check "POST /api/m/* without auth → 401" "401" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
check "POST /api/upload without auth → 401" "401" "$code"

loc=$(curl -s -o /dev/null -w "%{url_effective}" -L "$BASE/admin")
check_contains "GET /admin redirects to login" "$loc" "/admin/login"

# --- 管理员登录 ---
ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_contains "Admin login" "$ADMIN_RESP" '"ok":true'

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
check "POST /api/upload non-multipart → 400" "400" "$code"

for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  check "GET $path (admin)" "200" "$code"
done

# --- 用户登录 ---
USER_RESP=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_contains "User login" "$USER_RESP" '"ok":true'

# --- 从页面提取 ID ---
PROJECT_ID=$(curl -s "$BASE/m/auction" | grep -oE 'href="/m/auction/[a-z0-9]+"' | head -1 | sed 's|.*/||;s/"//')
LISTING_ID=$(curl -s "$BASE/m/drying" | grep -oE 'href="/m/drying/[a-z0-9]+"' | head -1 | sed 's|.*/||;s/"//')

if [ -n "$PROJECT_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction/$PROJECT_ID")
  check "GET /m/auction/$PROJECT_ID" "200" "$code"

  # 获取最低出价
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
    const { PrismaClient } = require('@prisma/client');
    const { Decimal } = require('@prisma/client/runtime/library');
    const p = new PrismaClient();
    (async () => {
      const project = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
      const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
      const min = top ? new Decimal(top.amount.toString()).plus(project.bidStep.toString()) : new Decimal(project.startPrice.toString());
      console.log(min.toFixed(2));
      await p.\$disconnect();
    })();
  " 2>/dev/null)

  BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  check_contains "POST bid at min price" "$BID_RESP" '"ok":true'
else
  echo "✗ No auction project found on /m/auction"
  FAIL=$((FAIL + 1))
fi

if [ -n "$LISTING_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying/$LISTING_ID")
  check "GET /m/drying/$LISTING_ID" "200" "$code"

  START=$(date -d "+7 days" +%Y-%m-%d)
  END=$(date -d "+14 days" +%Y-%m-%d)
  RESERVE_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check_contains "POST drying reserve" "$RESERVE_RESP" '"ok":true'

  OVERLAP_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check_contains "POST overlapping reserve rejected" "$OVERLAP_RESP" "重叠"
else
  echo "✗ No drying listing found on /m/drying"
  FAIL=$((FAIL + 1))
fi

# --- 第三方 token ---
TP_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test")
check_contains "GET third-party-token" "$TP_RESP" '"token"'

# --- 受保护页面 ---
for path in "/m/me" "/m/orders"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" "$BASE$path")
  check "GET $path (user)" "200" "$code"
done

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
