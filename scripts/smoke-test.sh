#!/usr/bin/env bash
# 功能冒烟测试：需 dev server 与 MariaDB
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

check() {
  local name="$1" code="$2" expect="$3"
  if [[ "$code" != "$expect" ]]; then
    echo "FAIL: $name (got $code, want $expect)"
    FAIL=1
  else
    echo "OK: $name"
  fi
}

# 页面
for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "$code" "200"
done

# 用户登录
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
check "POST /api/auth/login" "$code" "200"

# 管理端登录
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
check "POST /api/auth/admin/login" "$code" "200"

# 获取竞拍项目 ID
PROJECT_ID=$(curl -s "$BASE/m/auction" | grep -oP 'href="/m/auction/\K[^"]+' | head -1 || true)
if [[ -z "${PROJECT_ID:-}" ]]; then
  echo "WARN: no auction project on /m/auction"
else
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction/$PROJECT_ID")
  check "GET /m/auction/[id]" "$code" "200"

  # 出价（需登录 cookie）
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":8200}')
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')
  if [[ "$code" == "200" ]] || [[ "$code" == "400" ]]; then
    echo "OK: POST bid (code=$code)"
  else
    echo "FAIL: POST bid (code=$code) body=$body"
    FAIL=1
  fi
fi

# 晒场预约页
LISTING=$(curl -s "$BASE/m/drying" | grep -oP 'href="/m/drying/\K[^"]+' | head -1 || true)
if [[ -n "${LISTING:-}" ]]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying/$LISTING")
  check "GET /m/drying/[id]" "$code" "200"
fi

# 第三方 token（dev，参数为 u_id）
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
check "GET /api/dev/third-party-token" "$code" "200"

rm -f "$COOKIE_JAR" "$ADMIN_JAR"
if [[ $FAIL -ne 0 ]]; then exit 1; fi
echo "All smoke checks passed."
