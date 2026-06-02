#!/usr/bin/env bash
# 功能冒烟测试：API 与关键页面
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

fail=0
ok() { echo "  OK: $1"; }
err() { echo "  FAIL: $1"; fail=1; }

check_http() {
  local name="$1" url="$2" expect="${3:-200}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [[ "$code" == "$expect" ]]; then ok "$name ($code)"; else err "$name expected $expect got $code"; fi
}

echo "=== 页面 ==="
for path in / /m /m/login /admin/login; do
  check_http "$path" "$BASE$path"
done

echo "=== 用户登录 ==="
RES=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$RES" | grep -q '"ok":true\|"success":true\|"user"'; then
  ok "tenant login"
else
  err "tenant login: $RES"
fi

echo "=== 管理员登录 ==="
ARES=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ARES" | grep -qE '"ok":true|"success":true|"admin"'; then
  ok "admin login"
else
  err "admin login: $ARES"
fi

echo "=== 受保护管理页（需 cookie）==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
if [[ "$code" == "200" ]]; then ok "admin dashboard"; else err "admin dashboard $code"; fi

echo "=== 第三方 token（开发）==="
TRES=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
if echo "$TRES" | grep -q '"token"'; then
  ok "dev third-party token"
  TOKEN=$(echo "$TRES" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  SSO=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
  if [[ "$SSO" == "200" || "$SSO" == "302" || "$SSO" == "307" ]]; then ok "sso page"; else err "sso $SSO"; fi
else
  err "third-party token: $TRES"
fi

echo "=== 移动端页面（登录后）==="
for path in /m/me /m/auction /m/orders /m/drying; do
  check_http "$path (auth)" "$BASE$path" 200
done

echo "=== 竞拍出价（演示用户）==="
curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' >/dev/null
PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT id FROM AuctionProject WHERE status='LIVE' LIMIT 1;" 2>/dev/null || true)
if [[ -z "$PROJECT_ID" ]]; then
  err "no LIVE auction project (run npm run db:seed)"
else
  TOP=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT COALESCE(MAX(amount),0) FROM AuctionBid WHERE projectId='$PROJECT_ID';")
  START=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT startPrice FROM AuctionProject WHERE id='$PROJECT_ID';")
  STEP=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT bidStep FROM AuctionProject WHERE id='$PROJECT_ID';")
  NEXT=$(python3 -c "t=float('$TOP'); s=float('$START'); st=float('$STEP'); print(max(s, t+st) if t>0 else s)")
  BRES=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\": $NEXT}")
  if echo "$BRES" | grep -q '"ok":true'; then ok "auction bid"; else err "auction bid: $BRES"; fi
fi

echo "=== 登出 ==="
curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout" >/dev/null
ok "user logout"

if [[ $fail -ne 0 ]]; then
  echo "=== 部分测试失败 ==="
  exit 1
fi
echo "=== 全部通过 ==="
