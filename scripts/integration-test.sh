#!/usr/bin/env bash
# 功能完整性冒烟测试（需 dev server + 已 seed 的数据库）
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

# 门户首页
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
[[ "$code" == "200" ]] || fail "GET / => $code"
ok "GET /"

# 管理端登录页
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
[[ "$code" == "200" ]] || fail "GET /admin/login => $code"
ok "GET /admin/login"

# 移动端登录页
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")
[[ "$code" == "200" ]] || fail "GET /m/login => $code"
ok "GET /m/login"

# 管理员登录
admin_resp=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$admin_resp" | grep -q '"ok":true' || fail "admin login: $admin_resp"
ok "POST /api/auth/admin/login"

# 管理后台首页（需 cookie）
code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin")
[[ "$code" == "200" ]] || fail "GET /admin => $code"
ok "GET /admin (authenticated)"

# 承租用户登录
user_resp=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$user_resp" | grep -q '"ok":true' || fail "user login: $user_resp"
ok "POST /api/auth/login"

# 移动端个人中心
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/me")
[[ "$code" == "200" ]] || fail "GET /m/me => $code"
ok "GET /m/me (authenticated)"

# 竞拍列表
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction")
[[ "$code" == "200" ]] || fail "GET /m/auction => $code"
ok "GET /m/auction"

# 晒场列表
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/drying")
[[ "$code" == "200" ]] || fail "GET /m/drying => $code"
ok "GET /m/drying"

# 第三方 token（开发）
tp_resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-ext-001")
echo "$tp_resp" | grep -q 'token' || fail "third-party-token: $tp_resp"
token=$(echo "$tp_resp" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[[ -n "$token" ]] || fail "could not parse third-party token"
ok "GET /api/dev/third-party-token"

# SSO 登录
code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/m/sso?token=$token")
[[ "$code" == "200" ]] || fail "GET /m/sso => $code"
ok "GET /m/sso"

# 查找竞拍详情页链接（排除列表页 /m/auction/page）
auction_html=$(curl -s -b "$COOKIE_JAR" "$BASE/m/auction")
project_id=$(echo "$auction_html" | grep -oE '/m/auction/[a-z0-9]{20,}' | head -1 | sed 's|.*/||' || true)
if [[ -n "${project_id:-}" ]]; then
  bid_resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$project_id/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":"100"}' 2>/dev/null || echo '{}')
  # 可能因已出过价/价格不符失败，但不应 500
  if echo "$bid_resp" | grep -q 'Internal Server Error'; then
    fail "bid API 500: $bid_resp"
  fi
  ok "POST /api/m/auction/$project_id/bid (no 500)"
else
  echo "SKIP: no live auction link in /m/auction"
fi

# 未授权访问管理 API
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
[[ "$code" == "401" || "$code" == "403" ]] || fail "unauth admin assets => $code (expected 401/403)"
ok "POST /api/admin/assets unauthenticated => $code"

echo ""
echo "All integration checks passed."
