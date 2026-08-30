#!/bin/bash
set -euo pipefail
BASE="http://localhost:3000"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/smoke_cookies.txt"
ADMIN_JAR="/tmp/smoke_admin.txt"
rm -f "$COOKIE_JAR" "$ADMIN_JAR"

check_status() {
  local name="$1" expected="$2" url="$3" method="${4:-GET}" data="${5:-}" cookie="${6:-}"
  local code
  if [ "$method" = "POST" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -b "$cookie" -X POST -H "Content-Type: application/json" -d "$data" "$url")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" -b "$cookie" "$url")
  fi
  if [ "$code" = "$expected" ]; then
    echo "✓ $name ($code)"
    PASS=$((PASS+1))
  else
    echo "✗ $name (expected $expected, got $code)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== 页面可达性 ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/m/me" "/admin/login"; do
  check_status "GET $path" "200" "$BASE$path"
done

echo "=== 未登录保护 ==="
check_status "GET /admin (no auth)" "307" "$BASE/admin"
check_status "POST /api/m/auction/x/bid (no auth)" "401" "$BASE/api/m/auction/x/bid" "POST" '{"amount":100}'

echo "=== 用户登录 ==="
RESP=$(curl -s -c "$COOKIE_JAR" -X POST -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}' "$BASE/api/auth/login")
if echo "$RESP" | grep -q '"ok":true'; then
  echo "✓ 用户登录"
  PASS=$((PASS+1))
else
  echo "✗ 用户登录: $RESP"
  FAIL=$((FAIL+1))
fi

echo "=== 管理员登录 ==="
RESP=$(curl -s -c "$ADMIN_JAR" -X POST -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}' "$BASE/api/auth/admin/login")
if echo "$RESP" | grep -q '"ok":true'; then
  echo "✓ 管理员登录"
  PASS=$((PASS+1))
else
  echo "✗ 管理员登录: $RESP"
  FAIL=$((FAIL+1))
fi

echo "=== 登录后管理页面 ==="
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/dict" "/admin/drying" "/admin/organizations" "/admin/announcements" "/admin/audit" "/admin/config" "/admin/admins" "/admin/registrations"; do
  check_status "GET $path" "200" "$BASE$path" "GET" "" "$ADMIN_JAR"
done

echo "=== 第三方 token ==="
RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=testuser")
if echo "$RESP" | grep -q '"token"'; then
  echo "✓ dev third-party-token"
  PASS=$((PASS+1))
else
  echo "✗ dev third-party-token: $RESP"
  FAIL=$((FAIL+1))
fi

echo "=== 竞拍 ==="
AUCTION_HTML=$(curl -s -b "$COOKIE_JAR" "$BASE/m/auction")
PROJECT_ID=$(echo "$AUCTION_HTML" | grep -oE 'href="/m/auction/[a-z0-9]{20,}"' | head -1 | sed 's|href="/m/auction/||;s|"||')
if [ -n "$PROJECT_ID" ]; then
  echo "Found project: $PROJECT_ID"
  check_status "GET /m/auction/$PROJECT_ID" "200" "$BASE/m/auction/$PROJECT_ID" "GET" "" "$COOKIE_JAR"
  BID_RESP=$(curl -s -b "$COOKIE_JAR" -X POST -H "Content-Type: application/json" -d '{"amount":99999}' "$BASE/api/m/auction/$PROJECT_ID/bid")
  echo "  Bid response: $BID_RESP"
  if echo "$BID_RESP" | grep -qE '"ok":true|"error"'; then
    echo "✓ bid API responds"
    PASS=$((PASS+1))
  else
    echo "✗ bid API"
    FAIL=$((FAIL+1))
  fi
else
  echo "✗ No auction project found in /m/auction"
  FAIL=$((FAIL+1))
fi

echo "=== 晒场预约 ==="
check_status "GET /m/drying" "200" "$BASE/m/drying" "GET" "" "$COOKIE_JAR"
DRYING_HTML=$(curl -s -b "$COOKIE_JAR" "$BASE/m/drying")
DRYING_ID=$(echo "$DRYING_HTML" | grep -oE 'href="/m/drying/[a-z0-9]{20,}"' | head -1 | sed 's|href="/m/drying/||;s|"||')
if [ -n "$DRYING_ID" ]; then
  check_status "GET /m/drying/$DRYING_ID" "200" "$BASE/m/drying/$DRYING_ID" "GET" "" "$COOKIE_JAR"
else
  echo "✗ No drying field found"
  FAIL=$((FAIL+1))
fi

echo "=== 管理端 API ==="
check_status "GET /api/admin/assets (405 expected)" "405" "$BASE/api/admin/assets"
check_status "POST /api/admin/assets (no auth)" "401" "$BASE/api/admin/assets" "POST" '{}'

echo "=== 注册接口 ==="
check_status "POST /api/auth/register (empty)" "400" "$BASE/api/auth/register" "POST" '{}'

echo "=== 登出 ==="
check_status "POST /api/auth/logout" "200" "$BASE/api/auth/logout" "POST" '{}' "$COOKIE_JAR"
check_status "POST /api/auth/admin/logout" "200" "$BASE/api/auth/admin/logout" "POST" '{}' "$ADMIN_JAR"

echo ""
echo "=== 结果: $PASS passed, $FAIL failed ==="
exit $FAIL
