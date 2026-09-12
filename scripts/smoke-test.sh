#!/usr/bin/env bash
# API smoke tests — must run against `npm run dev` (not production build).
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/smoke-admin-cookies.txt"
USER_COOKIE="/tmp/smoke-user-cookies.txt"
rm -f "$COOKIE_JAR" "$USER_COOKIE"

check() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expected, got $actual) body=${body:0:120}"
    FAIL=$((FAIL + 1))
  fi
}

# 1–3. Pages
check "首页" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "管理登录页" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "H5首页" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"

# 4–5. Admin login
check "管理员错误密码" "401" "$(curl -s -o /tmp/smoke-r4 -w '%{http_code}' -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"wrong"}')"
check "管理员登录" "200" "$(curl -s -o /tmp/smoke-r5 -w '%{http_code}' -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')"

# 6–7. User login
check "用户登录" "200" "$(curl -s -o /tmp/smoke-r6 -w '%{http_code}' -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')"
check "用户错误密码" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"wrong"}')"

# 8–9. Register
check "注册缺参" "400" "$(curl -s -o /tmp/smoke-r8 -w '%{http_code}' -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d '{}')"
PHONE="199$(date +%s | tail -c 9)"
check "用户注册" "200" "$(curl -s -o /tmp/smoke-r9 -w '%{http_code}' -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")"

# 10–12. Upload / assets multipart guard
check "上传未登录" "401" "$(curl -s -o /tmp/smoke-r10 -w '%{http_code}' -X POST "$BASE/api/upload")"
check "上传非multipart" "400" "$(curl -s -o /tmp/smoke-r11 -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')"
check "资产API非multipart" "400" "$(curl -s -o /tmp/smoke-r12 -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{}')"

# 13–14. Auction bid
read -r PROJECT_ID MIN_BID < <(cd "$(dirname "$0")/.." && npx tsx scripts/smoke-helpers.ts auction)
check "出价未登录" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H 'Content-Type: application/json' -d '{"amount":100}')"
check "出价成功" "200" "$(curl -s -o /tmp/smoke-r14 -w '%{http_code}' -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}")" "$(cat /tmp/smoke-r14)"

# 15–16. Drying reserve
check "晒场预约未登录" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' -d '{}')"
read -r LISTING_ID START END < <(cd "$(dirname "$0")/.." && npx tsx scripts/smoke-helpers.ts drying)
check "晒场预约" "200" "$(curl -s -o /tmp/smoke-r16 -w '%{http_code}' -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")" "$(cat /tmp/smoke-r16)"

# 17–18. Misc
check "第三方token" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test123")"
check "管理员登出" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/logout")"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
