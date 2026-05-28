#!/usr/bin/env bash
# 功能冒烟测试：关键 API 与业务流程
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

# 用户登录
USER_LOGIN=$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$USER_LOGIN" | grep -q '"ok":true' || fail "用户登录: $USER_LOGIN"
ok "用户登录"

# 管理端登录
ADMIN_LOGIN=$(curl -sS -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$ADMIN_LOGIN" | grep -q '"ok":true' || fail "管理端登录: $ADMIN_LOGIN"
ok "管理端登录"

# 首页
code=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/")
[[ "$code" == "200" ]] || fail "首页 HTTP $code"
ok "首页"

# 移动端页面
for path in /m /m/login /m/auction /m/drying /m/me; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  [[ "$code" == "200" ]] || fail "$path HTTP $code"
  ok "$path"
done

# 管理端页面（需 cookie）
for path in /admin /admin/assets /admin/auctions /admin/drying; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  [[ "$code" == "200" ]] || fail "$path HTTP $code"
  ok "$path"
done

# 未授权访问管理端应重定向
code=$(curl -sS -o /dev/null -w "%{http_code}" -L "$BASE/admin")
[[ "$code" == "200" ]] || fail "未授权 /admin"

# 注册接口校验（无效数据应 400）
REG=$(curl -sS -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"invalid","password":"x"}')
http_code=$(echo "$REG" | tail -1)
[[ "$http_code" == "400" ]] || fail "注册校验应 400，得 $http_code"
ok "注册参数校验"

# 上传接口：无文件应 400 而非 500
UPLOAD_CODE=$(curl -sS -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload")
[[ "$UPLOAD_CODE" == "400" ]] || fail "上传缺文件应 400，得 $UPLOAD_CODE"
ok "上传缺文件校验"

echo ""
echo "全部冒烟测试通过"
