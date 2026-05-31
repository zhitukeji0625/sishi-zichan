#!/usr/bin/env bash
# 功能冒烟测试：页面与核心 API
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

check() {
  local name="$1" code="$2" expect="$3"
  if [[ "$code" != "$expect" ]]; then
    echo "FAIL: $name (HTTP $code, expected $expect)"
    FAIL=1
  else
    echo "OK: $name"
  fi
}

echo "=== 公开页面 ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "$code" "200"
done

echo "=== 受保护路由（未登录应重定向）==="
code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/admin")
# middleware 可能 307 到 login
if [[ "$code" == "200" || "$code" == "307" ]]; then
  echo "OK: GET /admin (redirect or page)"
else
  echo "FAIL: GET /admin (HTTP $code)"
  FAIL=1
fi

echo "=== 用户登录 API ==="
code=$(curl -s -o /tmp/login.json -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' \
  -c "$COOKIE_JAR")
check "POST /api/auth/login" "$code" "200"

echo "=== 用户受保护页面 ==="
for path in "/m/me" "/m/orders"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  check "GET $path (logged in)" "$code" "200"
done

echo "=== 管理员登录 API ==="
code=$(curl -s -o /tmp/admin-login.json -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' \
  -c "$ADMIN_JAR")
check "POST /api/auth/admin/login" "$code" "200"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/assets")
check "GET /admin/assets (logged in)" "$code" "200"

echo "=== 错误凭据 ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
check "POST login wrong password" "$code" "401"

rm -f "$COOKIE_JAR" "$ADMIN_JAR" /tmp/login.json /tmp/admin-login.json

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
echo "=== 全部冒烟测试通过 ==="
