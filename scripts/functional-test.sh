#!/usr/bin/env bash
# API 功能冒烟测试 — 需 dev server 运行在 localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== 功能冒烟测试 ($BASE) ==="

# 1. 首页
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "GET /" "200" "$code"

# 2. 用户登录页
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")
check "GET /m/login" "200" "$code"

# 3. 管理端登录页
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check "GET /admin/login" "200" "$code"

# 4. 未登录访问管理 API → 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets")
check "POST /api/admin/assets (no auth)" "401" "$code"

# 5. 管理员登录
ADMIN_COOKIE=$(mktemp)
admin_resp=$(curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
admin_ok=$(echo "$admin_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "false")
check "Admin login" "True" "$admin_ok"

# 6. 非 multipart 上传 → 应失败（400 或 415）
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
if [[ "$code" == "400" || "$code" == "415" ]]; then
  check "POST /api/upload (non-multipart)" "400" "$code"
else
  check "POST /api/upload (non-multipart)" "400" "$code"
fi

# 7. 用户登录
USER_COOKIE=$(mktemp)
user_resp=$(curl -s -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
user_ok=$(echo "$user_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "false")
check "User login" "True" "$user_ok"

# 8. 获取竞拍项目 ID 与出价金额
AUCTION_INFO=$(cd /workspace && npx tsx scripts/get-auction-info.ts 2>/dev/null || echo "{}")
PROJECT_ID=$(echo "$AUCTION_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('projectId',''))" 2>/dev/null || echo "")
BID_AMOUNT=$(echo "$AUCTION_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('bidAmount',''))" 2>/dev/null || echo "")

if [[ -n "$PROJECT_ID" && -n "$BID_AMOUNT" ]]; then
  bid_resp=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\": $BID_AMOUNT}")
  bid_ok=$(echo "$bid_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "false")
  if [[ "$bid_ok" == "True" ]]; then
    check "POST auction bid" "True" "$bid_ok"
  else
    err=$(echo "$bid_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error','unknown'))" 2>/dev/null || echo "unknown")
    echo "  ✗ POST auction bid (error: $err)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ✗ Could not resolve auction project for bid test"
  FAIL=$((FAIL + 1))
fi

# 9. 晒场预约
LISTING_ID=$(echo "$AUCTION_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('listingId',''))" 2>/dev/null || echo "")
if [[ -n "$LISTING_ID" ]]; then
  START=$(date -u -d "+2 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+2d +%Y-%m-%dT00:00:00.000Z)
  END=$(date -u -d "+3 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+3d +%Y-%m-%dT00:00:00.000Z)
  dry_resp=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  dry_ok=$(echo "$dry_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "false")
  if [[ "$dry_ok" == "True" ]]; then
    check "POST drying reserve" "True" "$dry_ok"
  else
    err=$(echo "$dry_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error','unknown'))" 2>/dev/null || echo "unknown")
    echo "  ✗ POST drying reserve (error: $err)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ✗ Could not resolve drying listing for reserve test"
  FAIL=$((FAIL + 1))
fi

# 10. 未登录出价 → 401
if [[ -n "$PROJECT_ID" ]]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount": 99999}')
  check "POST auction bid (no auth)" "401" "$code"
fi

# 11. 用户登出
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/auth/logout")
check "POST /api/auth/logout" "200" "$code"

rm -f "$ADMIN_COOKIE" "$USER_COOKIE"

TOTAL=$((PASS + FAIL))
echo ""
echo "=== 结果: $PASS/$TOTAL 通过 ==="
[[ "$FAIL" -eq 0 ]]
