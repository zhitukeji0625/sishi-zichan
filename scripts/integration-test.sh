#!/bin/bash
# 功能完整性集成测试（需 dev server + 已 seed 的数据库）
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

fail() { echo "FAIL: $1"; exit 1; }
ok() { echo "OK: $1"; }

# 1. 首页
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
[[ "$code" == "200" ]] || fail "GET / returned $code"
ok "GET /"

# 2. 租户登录
login=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$login" | grep -q '"ok":true' || fail "user login: $login"
ok "POST /api/auth/login (tenant)"

# 3. 管理端登录
admin_login=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$admin_login" | grep -q '"ok":true' || fail "admin login: $admin_login"
ok "POST /api/auth/admin/login"

# 4. 管理端页面（需 cookie）
code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin")
[[ "$code" == "200" ]] || fail "GET /admin returned $code"
ok "GET /admin (authenticated)"

# 5. 移动端页面
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m")
[[ "$code" == "200" ]] || fail "GET /m returned $code"
ok "GET /m (authenticated)"

# 6. 拍卖列表页
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction")
[[ "$code" == "200" ]] || fail "GET /m/auction returned $code"
ok "GET /m/auction"

# 7. 拍卖详情页（从数据库取 LIVE 项目 ID，避免 HTML 误匹配）
project_id=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then((r) => { console.log(r?.id ?? ''); return p.\$disconnect(); })
  .catch(() => process.exit(1));
" 2>/dev/null || true)
if [[ -z "${project_id:-}" ]]; then
  echo "SKIP: no LIVE auction project in database"
else
  code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction/$project_id")
  [[ "$code" == "200" ]] || fail "GET /m/auction/$project_id returned $code"
  ok "GET /m/auction/$project_id"
fi

# 8. 第三方 token（dev）
tp=$(curl -s "$BASE/api/dev/third-party-token?phone=13800138000")
echo "$tp" | grep -q 'token' || fail "dev third-party-token: $tp"
ok "GET /api/dev/third-party-token"

# 9. 注册接口校验（重复手机号应失败）
reg=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123","name":"dup"}')
echo "$reg" | grep -qE '"ok":false|"error"' || fail "register duplicate should fail: $reg"
ok "POST /api/auth/register (duplicate rejected)"

# 10. 未授权管理 API
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
[[ "$code" == "401" || "$code" == "403" ]] || fail "unauth admin assets POST returned $code"
ok "POST /api/admin/assets (unauthorized)"

echo ""
echo "All integration checks passed."
