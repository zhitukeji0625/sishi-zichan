#!/usr/bin/env bash
# 功能冒烟测试：需 dev server (localhost:3000) + MariaDB + seed
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0; FAIL=0

check() {
  local name="$1" code="$2" expected="$3"
  if [ "$code" = "$expected" ]; then echo "✓ $name"; PASS=$((PASS+1))
  else echo "✗ $name (expected $expected, got $code)"; FAIL=$((FAIL+1)); fi
}

echo "=== 页面可达性 ==="
check "首页" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")" "200"
check "管理登录" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")" "200"
check "H5首页" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")" "200"

echo ""
echo "=== 认证 ==="
curl -s -c /tmp/ft_admin.txt -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}' > /dev/null
check "管理员登录" "$(curl -s -b /tmp/ft_admin.txt -o /dev/null -w '%{http_code}' "$BASE/admin")" "200"

curl -s -c /tmp/ft_user.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}' > /dev/null
check "用户登录" "$(curl -s -b /tmp/ft_user.txt -o /dev/null -w '%{http_code}' "$BASE/m/me")" "200"

echo ""
echo "=== API 错误处理 ==="
check "upload 未登录" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload")" "401"
check "upload 非 multipart" "$(curl -s -b /tmp/ft_admin.txt -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')" "400"
check "admin assets 非 multipart" "$(curl -s -b /tmp/ft_admin.txt -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{}')" "400"
check "bid 未登录" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/x/bid" -H "Content-Type: application/json" -d '{"amount":100}')" "401"

echo ""
echo "通过: $PASS  失败: $FAIL"
[ "$FAIL" -eq 0 ]
