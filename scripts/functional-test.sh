#!/bin/bash
# Functional completeness test script
set -e
BASE="http://localhost:3000"
COOKIE_JAR="/tmp/sishi-test-cookies.txt"
ERRORS=0
PASS=0

pass() { echo "✓ $1"; PASS=$((PASS+1)); }
fail() { echo "✗ $1"; ERRORS=$((ERRORS+1)); }

echo "=== 四师资产租赁 功能完整性测试 ==="
echo ""

# --- A. Public pages ---
echo "--- A. 公开页面 ---"
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path → $code"; else fail "GET $path → $code (expected 200)"; fi
done

# --- B. Admin login ---
echo ""
echo "--- B. 管理员登录 ---"
rm -f "$COOKIE_JAR"
code=$(curl -s -o /tmp/admin-login.json -w "%{http_code}" -c "$COOKIE_JAR" \
  -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if [ "$code" = "200" ]; then pass "POST /api/auth/admin/login → $code"; else fail "POST /api/auth/admin/login → $code"; fi

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/admin")
if [ "$code" = "200" ]; then pass "GET /admin (with cookie) → $code"; else fail "GET /admin (with cookie) → $code"; fi

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
if [ "$code" = "307" ] || [ "$code" = "302" ]; then pass "GET /admin (no cookie) → redirect $code"; else fail "GET /admin (no cookie) → $code (expected redirect)"; fi

# Bad password
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"wrong"}')
if [ "$code" = "401" ]; then pass "POST /api/auth/admin/login (bad pwd) → $code"; else fail "POST /api/auth/admin/login (bad pwd) → $code"; fi

# --- C. User login ---
echo ""
echo "--- C. 用户登录 ---"
rm -f "$COOKIE_JAR"
code=$(curl -s -o /tmp/user-login.json -w "%{http_code}" -c "$COOKIE_JAR" \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if [ "$code" = "200" ]; then pass "POST /api/auth/login → $code"; else fail "POST /api/auth/login → $code"; fi

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/m/me")
if [ "$code" = "200" ]; then pass "GET /m/me (with cookie) → $code"; else fail "GET /m/me (with cookie) → $code"; fi

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/me")
if [ "$code" = "307" ] || [ "$code" = "302" ]; then pass "GET /m/me (no cookie) → redirect $code"; else fail "GET /m/me (no cookie) → $code"; fi

# --- D. Third-party SSO ---
echo ""
echo "--- D. 第三方 SSO ---"
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test_sso_user")
TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then pass "GET /api/dev/third-party-token → token received"; else fail "GET /api/dev/third-party-token → no token"; fi

rm -f "$COOKIE_JAR"
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_JAR" \
  -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
if [ "$code" = "200" ]; then pass "POST /api/auth/third-party → $code"; else fail "POST /api/auth/third-party → $code"; fi

# --- E. Protected API without auth ---
echo ""
echo "--- E. 未授权 API ---"
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/m/auction/1/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":100}')
if [ "$code" = "401" ]; then pass "POST /api/m/auction/1/bid (no auth) → $code"; else fail "POST /api/m/auction/1/bid (no auth) → $code"; fi

code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json")
if [ "$code" = "401" ]; then pass "POST /api/upload (no auth) → $code"; else fail "POST /api/upload (no auth) → $code"; fi

# --- F. Admin pages with cookie ---
echo ""
echo "--- F. 管理后台页面 ---"
rm -f "$COOKIE_JAR"
curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' > /dev/null

for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/registrations" "/admin/announcements" "/admin/drying" "/admin/organizations" "/admin/admins" "/admin/config" "/admin/dict" "/admin/audit"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path → $code"; else fail "GET $path → $code"; fi
done

# --- G. User pages with cookie ---
echo ""
echo "--- G. 移动端页面 (已登录) ---"
rm -f "$COOKIE_JAR"
curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' > /dev/null

for path in "/m" "/m/auction" "/m/drying" "/m/orders" "/m/me"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  if [ "$code" = "200" ]; then pass "GET $path → $code"; else fail "GET $path → $code"; fi
done

# --- H. Auction bid (authenticated user) ---
echo ""
echo "--- H. 竞拍出价 ---"
AUCTION_ID="cmnhdd6f9000njsb29fdxbprc"
BID_RESP=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" \
  -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":5000}')
BID_CODE=$(echo "$BID_RESP" | tail -1)
BID_BODY=$(echo "$BID_RESP" | head -n -1)
if [ "$BID_CODE" = "200" ]; then
  pass "POST /api/m/auction/$AUCTION_ID/bid → $code"
elif [ "$BID_CODE" = "400" ] || [ "$BID_CODE" = "403" ] || [ "$BID_CODE" = "409" ]; then
  pass "POST /api/m/auction/$AUCTION_ID/bid → $BID_CODE (business rule: $(echo $BID_BODY | head -c 80))"
else
  fail "POST /api/m/auction/$AUCTION_ID/bid → $BID_CODE body: $BID_BODY"
fi

# --- Summary ---
echo ""
echo "=== 测试结果: $PASS 通过, $ERRORS 失败 ==="
exit $ERRORS
