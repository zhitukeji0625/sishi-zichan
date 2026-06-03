#!/usr/bin/env bash
# API 冒烟测试 — 退出码非 0 表示失败
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; FAIL=1; }

# 用户登录
USER_LOGIN=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
USER_CODE=$(echo "$USER_LOGIN" | tail -1)
if [[ "$USER_CODE" == "200" ]]; then pass "用户登录"; else fail "用户登录 (HTTP $USER_CODE): $(echo "$USER_LOGIN" | head -1)"; fi

# 管理员登录
ADMIN_LOGIN=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_LOGIN" | tail -1)
if [[ "$ADMIN_CODE" == "200" ]]; then pass "管理员登录"; else fail "管理员登录 (HTTP $ADMIN_CODE): $(echo "$ADMIN_LOGIN" | head -1)"; fi

# 首页
HOME=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
[[ "$HOME" == "200" ]] && pass "首页" || fail "首页 (HTTP $HOME)"

# 移动端首页
M_HOME=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
[[ "$M_HOME" == "200" ]] && pass "移动端首页" || fail "移动端首页 (HTTP $M_HOME)"

# 管理端（需 cookie）
ADMIN_PAGE=$(curl -s -o /dev/null -w "%{http_code}" -L -b "$ADMIN_JAR" "$BASE/admin")
[[ "$ADMIN_PAGE" == "200" ]] && pass "管理端首页" || fail "管理端首页 (HTTP $ADMIN_PAGE)"

# 未授权创建资产（POST）
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: multipart/form-data" -F "orgId=x" -F "type=LAND" -F "name=t" -F "locationText=t")
[[ "$UNAUTH" == "401" ]] && pass "管理 API 未授权拦截" || fail "管理 API 未授权拦截 (HTTP $UNAUTH)"

# 拍卖列表页
AUCTION_PAGE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")
[[ "$AUCTION_PAGE" == "200" ]] && pass "拍卖列表页" || fail "拍卖列表页 (HTTP $AUCTION_PAGE)"

# 烘干列表页
DRYING_PAGE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying")
[[ "$DRYING_PAGE" == "200" ]] && pass "烘干列表页" || fail "烘干列表页 (HTTP $DRYING_PAGE)"

# 错误密码登录
BAD_LOGIN=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
BAD_CODE=$(echo "$BAD_LOGIN" | tail -1)
[[ "$BAD_CODE" == "401" || "$BAD_CODE" == "400" ]] && pass "错误密码拒绝" || fail "错误密码拒绝 (HTTP $BAD_CODE)"

# 未登录访问受保护 API
PROT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d '{"listingId":"x","startDate":"2026-06-10","endDate":"2026-06-11"}')
[[ "$PROT" == "401" ]] && pass "移动端 API 未登录拦截" || fail "移动端 API 未登录拦截 (HTTP $PROT)"

# 第三方 SSO（开发 token）
TOKEN_JSON=$(curl -s "$BASE/api/dev/third-party-token")
TOKEN=$(echo "$TOKEN_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)
if [[ -n "$TOKEN" ]]; then
  SSO=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
  [[ "$SSO" == "200" ]] && pass "第三方 SSO" || fail "第三方 SSO (HTTP $SSO)"
else
  fail "第三方 SSO（无法获取 dev token）"
fi

# 登出
LOGOUT=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
[[ "$LOGOUT" == "200" || "$LOGOUT" == "204" ]] && pass "用户登出" || fail "用户登出 (HTTP $LOGOUT)"

rm -f "$COOKIE_JAR" "$ADMIN_JAR"
echo ""
if [[ $FAIL -eq 0 ]]; then echo "全部冒烟测试通过"; else echo "存在失败项"; fi
exit $FAIL
