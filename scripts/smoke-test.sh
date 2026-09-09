#!/bin/bash
set -euo pipefail

BASE="http://localhost:3000"
COOKIE_JAR=$(mktemp)
PASS=0
FAIL=0
ERRORS=()

log() { echo "[$(date +%H:%M:%S)] $*"; }
pass() { PASS=$((PASS+1)); log "✓ $1"; }
fail() { FAIL=$((FAIL+1)); ERRORS+=("$1"); log "✗ $1"; }

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
[[ "$code" == "200" ]] && pass "首页 200" || fail "首页 期望 200 实际 $code"

# 2. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
[[ "$code" == "200" ]] && pass "管理后台登录页 200" || fail "管理后台登录页 期望 200 实际 $code"

# 3. Mobile login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/login")
[[ "$code" == "200" ]] && pass "移动端登录页 200" || fail "移动端登录页 期望 200 实际 $code"

# 4. Admin login API
resp=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$resp" | grep -q '"ok":true' && pass "管理员登录" || fail "管理员登录失败: $resp"

# 5. Admin dashboard
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin")
[[ "$code" == "200" ]] && pass "管理后台首页 200" || fail "管理后台首页 期望 200 实际 $code"

# 6. Upload non-multipart should return 400
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
[[ "$code" == "400" ]] && pass "上传非 multipart 返回 400" || fail "上传非 multipart 期望 400 实际 $code"

# 7. Admin assets non-multipart should return 400
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
[[ "$code" == "400" ]] && pass "资产创建非 multipart 返回 400" || fail "资产创建非 multipart 期望 400 实际 $code"

# 8. User login
USER_JAR=$(mktemp)
resp=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$resp" | grep -q '"ok":true' && pass "用户登录" || fail "用户登录失败: $resp"

# 9. Mobile home
code=$(curl -s -b "$USER_JAR" -o /dev/null -w "%{http_code}" "$BASE/m")
[[ "$code" == "200" ]] && pass "移动端首页 200" || fail "移动端首页 期望 200 实际 $code"

# 10. Auction list page
html=$(curl -s -b "$USER_JAR" "$BASE/m/auction")
code=$(curl -s -b "$USER_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction")
[[ "$code" == "200" ]] && pass "竞拍列表页 200" || fail "竞拍列表页 期望 200 实际 $code"

# Extract project ID from page
project_id=$(echo "$html" | grep -oE 'c[a-z0-9]{20,}' | head -1)
if [[ -n "$project_id" ]]; then
  pass "竞拍项目 ID 提取: $project_id"
else
  fail "无法从竞拍列表页提取项目 ID"
fi

# 11. Auction detail page
if [[ -n "$project_id" ]]; then
  code=$(curl -s -b "$USER_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction/$project_id")
  [[ "$code" == "200" ]] && pass "竞拍详情页 200" || fail "竞拍详情页 期望 200 实际 $code"
fi

# 12. Bid on auction (dynamic min bid)
if [[ -n "$project_id" ]]; then
  bid_resp=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$project_id/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":999999}')
  if echo "$bid_resp" | grep -q '"ok":true'; then
    pass "竞拍出价"
  elif echo "$bid_resp" | grep -q '出价'; then
    # Try with a lower amount - get error message for min bid
    err=$(echo "$bid_resp" | grep -oE '"error":"[^"]*"' | head -1)
    # Try bid with amount 50000
    bid_resp2=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$project_id/bid" \
      -H "Content-Type: application/json" \
      -d '{"amount":50000}')
    echo "$bid_resp2" | grep -q '"ok":true' && pass "竞拍出价" || fail "竞拍出价失败: $bid_resp2 (首次: $err)"
  else
    fail "竞拍出价失败: $bid_resp"
  fi
fi

# 13. Drying page
code=$(curl -s -b "$USER_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/drying")
[[ "$code" == "200" ]] && pass "晒场列表页 200" || fail "晒场列表页 期望 200 实际 $code"

# 14. Drying reservation
drying_html=$(curl -s -b "$USER_JAR" "$BASE/m/drying")
listing_id=$(echo "$drying_html" | grep -oE 'c[a-z0-9]{20,}' | head -1)
if [[ -n "$listing_id" ]]; then
  start_date=$(date -d "+5 days" +%Y-%m-%d 2>/dev/null || date -v+5d +%Y-%m-%d 2>/dev/null)
  end_date=$(date -d "+6 days" +%Y-%m-%d 2>/dev/null || date -v+6d +%Y-%m-%d 2>/dev/null)
  dry_resp=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$listing_id\",\"startDate\":\"$start_date\",\"endDate\":\"$end_date\"}")
  if echo "$dry_resp" | grep -q '"ok":true'; then
    pass "晒场预约"
  elif echo "$dry_resp" | grep -q '冲突\|已预约\|审核'; then
    pass "晒场预约（已有预约/冲突，API 正常响应）"
  else
    fail "晒场预约失败: $dry_resp"
  fi
else
  fail "无法从晒场页提取 listing ID"
fi

# 15. User register
phone="199$(date +%s | tail -c 9)"
reg_resp=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$phone\",\"password\":\"test1234\",\"name\":\"测试用户\"}")
echo "$reg_resp" | grep -q '"ok":true' && pass "用户注册 ($phone)" || fail "用户注册失败: $reg_resp"

# 16. Third-party token (dev)
token_resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=test_user_001")
echo "$token_resp" | grep -q '"token"' && pass "第三方 token 生成" || fail "第三方 token 失败: $token_resp"

# 17. Admin logout
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/logout")
[[ "$code" == "200" ]] && pass "管理员登出" || fail "管理员登出 期望 200 实际 $code"

# 18. Unauthenticated bid should fail
if [[ -n "$project_id" ]]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$project_id/bid" \
    -H "Content-Type: application/json" -d '{"amount":100}')
  [[ "$code" == "401" ]] && pass "未登录出价返回 401" || fail "未登录出价 期望 401 实际 $code"
fi

# 19. Build check - admin assets page
resp=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
[[ "$code" == "200" ]] && pass "资产列表页 200" || fail "资产列表页 期望 200 实际 $code"

rm -f "$COOKIE_JAR" "$USER_JAR"

echo ""
echo "========================================="
echo "冒烟测试完成: $PASS 通过, $FAIL 失败"
echo "========================================="
if [[ $FAIL -gt 0 ]]; then
  echo "失败项:"
  for e in "${ERRORS[@]}"; do echo "  - $e"; done
  exit 1
fi
exit 0
