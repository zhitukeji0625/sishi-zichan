#!/usr/bin/env bash
# 冒烟测试：需已启动 MariaDB、db:push/seed 与 dev 或 start 服务（默认 localhost:3000）
set -euo pipefail
BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
ADMIN_PHONE="${SMOKE_ADMIN_PHONE:-13900000001}"
ADMIN_PASS="${SMOKE_ADMIN_PASS:-admin123}"
USER_PHONE="${SMOKE_USER_PHONE:-13800138000}"
USER_PASS="${SMOKE_USER_PASS:-user123}"

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/" || echo 000)
[[ "$code" == "200" ]] || fail "首页 $code"

ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$ADMIN_JAR" "$USER_JAR"' EXIT

res=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$ADMIN_PHONE\",\"password\":\"$ADMIN_PASS\"}")
echo "$res" | grep -q '"ok":true' || fail "管理员登录 $res"
ok "管理员登录"

res=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$USER_PHONE\",\"password\":\"$USER_PASS\"}")
echo "$res" | grep -q '"ok":true' || fail "用户登录 $res"
ok "用户登录"

for path in /m /m/auction /m/drying; do
  c=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  [[ "$c" == "200" ]] || fail "$path -> $c"
done
for path in /admin /admin/assets /admin/auctions; do
  c=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  [[ "$c" == "200" ]] || fail "$path -> $c"
done
ok "主要页面可访问"

bad=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H "Content-Type: application/json" -d '{"amount":1}')
[[ "$bad" == "401" ]] || fail "未登录出价应 401，得 $bad"
ok "API 鉴权"

echo "smoke-test 全部通过"
