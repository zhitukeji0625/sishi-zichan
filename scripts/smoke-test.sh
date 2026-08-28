#!/usr/bin/env bash
# 冒烟测试：验证核心页面与 API 可用（需 dev server 已启动）
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

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

check_body() {
  local name="$1" pattern="$2" body="$3"
  if echo "$body" | grep -q "$pattern"; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (pattern '$pattern' not found)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test: $BASE ==="

# 1-7: 公开页面
for path in "/" "/admin/login" "/m" "/m/login" "/m/auction" "/m/drying" "/m/me"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# 8: favicon/icon
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/icon")
check "GET /icon" "200" "$code"

# 9: 管理员登录
resp=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_body "admin login" '"ok"' "$resp"

# 10: 管理后台概览
code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin")
check "GET /admin (authed)" "200" "$code"

# 11-12: 数据字典与资产页
for path in "/admin/dict" "/admin/assets"; do
  code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# 13: 字典数据已种子化（勿用 curl|grep -q + pipefail，会 SIGPIPE）
dict_body=$(curl -s -b "$ADMIN_JAR" "$BASE/admin/dict")
check_body "dict seeded" "资产类型" "$dict_body"

# 14: 用户登录
resp=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_body "user login" '"ok"' "$resp"

# 15: 第三方 token
token_resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-user-001")
check_body "third-party token" '"token"' "$token_resp"

# 16: 未登录出价应 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/1/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
check "bid without auth" "401" "$code"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
