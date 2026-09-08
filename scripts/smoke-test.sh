#!/usr/bin/env bash
# 冒烟测试：验证核心 API 端点（需在 dev server 运行时使用）
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_DIR=$(mktemp -d)
USER_COOKIE="$COOKIE_DIR/user.txt"
ADMIN_COOKIE="$COOKIE_DIR/admin.txt"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke Test: $BASE ==="

# 1. 首页
check "GET /" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"

# 2. 移动端首页
check "GET /m" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"

# 3. 用户登录
check "POST /api/auth/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' \
  -c "$USER_COOKIE")"

# 4. 管理员登录
check "POST /api/auth/admin/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' \
  -c "$ADMIN_COOKIE")"

# 5. 重复注册返回 409
check "POST /api/auth/register (duplicate)" "409" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123","name":"test","idCard":"650101199001011234","orgId":"x"}')"

# 6. 上传 API 非 multipart 返回 400
check "POST /api/upload (non-multipart)" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" \
  -b "$ADMIN_COOKIE" -H "Content-Type: application/json" -d '{}')"

# 7. 资产 API 非 multipart 返回 400
check "POST /api/admin/assets (non-multipart)" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/assets" \
  -b "$ADMIN_COOKIE" -H "Content-Type: application/json" -d '{}')"

# 8. 管理后台未登录重定向
check "GET /admin (no auth)" "307" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")"

# 9. 第三方 token（dev 模式）
check "GET /api/dev/third-party-token" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token")"

# 10. 用户个人页
check "GET /m/me" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_COOKIE" "$BASE/m/me")"

# 11. 竞拍列表
check "GET /m/auction" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_COOKIE" "$BASE/m/auction")"

# 12. 晒场列表
check "GET /m/drying" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_COOKIE" "$BASE/m/drying")"

# 13. 管理后台资产页
check "GET /admin/assets" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" "$BASE/admin/assets")"

# 14. 管理后台竞拍页
check "GET /admin/auctions" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" "$BASE/admin/auctions")"

# 15. 晒场预约（需 listingId）
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { console.log(r?.id ?? ''); })
  .finally(() => p.\$disconnect());
" 2>/dev/null)
if [ -n "$LISTING_ID" ]; then
  START=$(date -u -d "+3 days" +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
  END=$(date -u -d "+5 days" +%Y-%m-%d 2>/dev/null || date -u -v+5d +%Y-%m-%d)
  check "POST /api/m/drying/reserve" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/drying/reserve" \
    -b "$USER_COOKIE" -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")"
else
  echo "  ⚠ 跳过晒场预约（无 OPERATING listing）"
fi

rm -rf "$COOKIE_DIR"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
