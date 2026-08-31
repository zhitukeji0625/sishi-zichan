#!/bin/bash
# 功能完整性冒烟测试 — 不依赖 GUI，适合 cron 定时执行
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/smoke-admin-cookies.txt"
USER_JAR="/tmp/smoke-user-cookies.txt"
rm -f "$COOKIE_JAR" "$USER_JAR"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_json_ok() {
  local name="$1" resp="$2"
  if echo "$resp" | grep -qE '"ok":\s*true|"success":\s*true|"id"'; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name: $resp"
    FAIL=$((FAIL + 1))
  fi
}

# 1–4 页面可达
check "Homepage" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "Mobile H5" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "Admin login page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "User login page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"

# 5 管理员登录
ADMIN_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json_ok "Admin login API" "$ADMIN_RESP"

# 6 管理端字典页
check "Admin dict page" "200" "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin/dict")"

# 7 用户登录
USER_RESP=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_json_ok "User login API" "$USER_RESP"

# 8–9 移动端列表
check "Mobile auction" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check "Mobile drying" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"

# 10 第三方 token
TP_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test")
if echo "$TP_RESP" | grep -q 'token'; then
  echo "✓ Third-party token API"
  PASS=$((PASS + 1))
else
  echo "✗ Third-party token API: $TP_RESP"
  FAIL=$((FAIL + 1))
fi

# 11 动态出价（从数据库获取 LIVE 项目 ID）
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true, startPrice: true, bidStep: true } })
  .then(async (proj) => {
    if (!proj) { console.log(''); return; }
    const top = await p.auctionBid.findFirst({ where: { projectId: proj.id }, orderBy: { amount: 'desc' } });
    const base = top ? Number(top.amount) : Number(proj.startPrice);
    const step = Number(proj.bidStep);
    console.log(proj.id + ' ' + (base + step));
    await p.\$disconnect();
  });
" 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  PID=$(echo "$PROJECT_ID" | awk '{print $1}')
  BID_AMOUNT=$(echo "$PROJECT_ID" | awk '{print $2}')
  echo "✓ Found LIVE auction: $PID (bid=$BID_AMOUNT)"
  PASS=$((PASS + 1))
  BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$BID_AMOUNT}")
  check_json_ok "Bid API (amount=$BID_AMOUNT)" "$BID_RESP"
else
  echo "✗ No LIVE auction project found"
  FAIL=$((FAIL + 2))
fi

# 12–13 管理端列表
check "Admin assets" "200" "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin/assets")"
check "Admin auctions" "200" "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin/auctions")"

# 14 字典数据
DICT_COUNT=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dictCategory.count().then(c => { console.log(c); p.\$disconnect(); });
" 2>/dev/null | tail -1)
if [ "${DICT_COUNT:-0}" -gt 0 ]; then
  echo "✓ Dict categories seeded ($DICT_COUNT)"
  PASS=$((PASS + 1))
else
  echo "✗ Dict categories empty (count=${DICT_COUNT:-0})"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit "$FAIL"
