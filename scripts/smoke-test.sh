#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$USER_JAR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "首页" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check "管理端登录页" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
check "移动端首页" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
check "管理端未登录重定向" "307" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' \
  -c "$COOKIE_JAR")
check "管理员登录" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' \
  -c "$USER_JAR")
check "用户登录" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check "重复注册返回409" "409" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test_user")
check "第三方token(dev)" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
check "上传未登录" "401" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR" \
  -d '{}')
check "上传非multipart" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets")
check "资产创建未登录" "401" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR" \
  -d '{}')
check "资产非multipart" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"x","startDate":"2026-09-10","endDate":"2026-09-11"}')
check "晒场预约未登录" "401" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/demo/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":100}')
check "竞拍出价未登录" "401" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
check "错误密码登录" "401" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit "$FAIL"
