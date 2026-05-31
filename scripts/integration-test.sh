#!/usr/bin/env bash
# 集成测试：竞拍出价、晒场预约、模拟支付
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
FAIL=0

fail() { echo "FAIL: $*"; FAIL=1; }
pass() { echo "OK: $*"; }

# 准备 LIVE 竞拍项目
read -r PROJECT_ID START_PRICE LISTING_ID <<< "$(cd /workspace && npx tsx scripts/prepare-test-data.ts 2>/dev/null)"

if [[ -z "$PROJECT_ID" ]]; then
  fail "无法准备测试数据"
  exit 1
fi
pass "测试数据 project=$PROJECT_ID listing=$LISTING_ID"

curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' > /dev/null

# 竞拍出价
resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/${PROJECT_ID}/bid" \
  -H "Content-Type: application/json" \
  -d "{\"amount\": $START_PRICE}")
if echo "$resp" | grep -q '"ok":true'; then
  pass "auction bid at start price"
else
  fail "auction bid: $resp"
fi

# 第二次出价应满足加价
NEXT=$((START_PRICE + 200))
resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/${PROJECT_ID}/bid" \
  -H "Content-Type: application/json" \
  -d "{\"amount\": $NEXT}")
if echo "$resp" | grep -q '"ok":true'; then
  pass "auction bid increment"
else
  fail "auction bid increment: $resp"
fi

# 晒场预约
resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-08-01\",\"endDate\":\"2026-08-03\"}")
if echo "$resp" | grep -q '"ok":true'; then
  pass "drying reserve"
  RES_ID=$(echo "$resp" | node -pe "JSON.parse(require('fs').readFileSync(0)).id")
else
  fail "drying reserve: $resp"
  RES_ID=""
fi

# 模拟支付保证金（需先审核通过，此处仅测未报名项目的错误路径）
resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/payments/mock" \
  -H "Content-Type: application/json" \
  -d "{\"purpose\":\"AUCTION_DEPOSIT\",\"auctionProjectId\":\"$PROJECT_ID\"}")
if echo "$resp" | grep -q '"error":"保证金已缴纳"'; then
  pass "mock payment deposit already paid (expected)"
elif echo "$resp" | grep -q '"ok":true'; then
  pass "mock payment deposit"
else
  fail "mock payment: $resp"
fi

# 第三方 token（dev）
if [[ "${NODE_ENV:-development}" != "production" ]]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?phone=13800138000")
  if [[ "$code" == "200" ]]; then
    pass "dev third-party token"
  else
    fail "dev third-party token HTTP $code"
  fi
fi

# 管理员资产 API
ADMIN_JAR=$(mktemp)
curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' > /dev/null
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/auctions")
if [[ "$code" == "200" ]]; then
  pass "GET /admin/auctions (admin session)"
else
  fail "GET /admin/auctions HTTP $code"
fi

rm -f "$COOKIE_JAR" "$ADMIN_JAR"
[[ "$FAIL" -eq 0 ]] && echo "=== 集成测试通过 ===" || exit 1
