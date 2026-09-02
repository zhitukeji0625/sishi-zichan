#!/usr/bin/env bash
# 功能完整性冒烟测试 — 需 dev server 运行在 localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR" "$USER_JAR"' EXIT

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

check_status() {
  local name="$1" url="$2" expected="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" = "$expected" ]; then pass "$name ($code)"; else fail "$name (got $code, want $expected)"; fi
}

echo "=== 页面可达性 ==="
for path in "/" "/m" "/m/login" "/m/auction" "/admin/login"; do
  check_status "GET $path" "$BASE$path" "200"
done

echo ""
echo "=== 管理员登录 ==="
ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$ADMIN_RESP" | grep -q '"ok":true'; then pass "admin login"; else fail "admin login: $ADMIN_RESP"; fi

echo ""
echo "=== 用户登录 ==="
USER_RESP=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$USER_RESP" | grep -q '"ok":true'; then pass "user login"; else fail "user login: $USER_RESP"; fi

echo ""
echo "=== 字典数据 ==="
DICT_HTML=$(curl -s -b "$ADMIN_JAR" "$BASE/admin/dict")
if echo "$DICT_HTML" | grep -q "数据字典"; then pass "dict page loads"; else fail "dict page missing title"; fi
DICT_COUNT=$(echo "$DICT_HTML" | grep -o 'href="/admin/dict?cat=' | wc -l | tr -d ' ')
if [ "${DICT_COUNT:-0}" -ge 14 ]; then pass "dict categories present ($DICT_COUNT)"; else fail "dict categories insufficient ($DICT_COUNT, want >=14)"; fi

echo ""
echo "=== 竞拍列表 ==="
AUCTION_HTML=$(curl -s "$BASE/m/auction")
if echo "$AUCTION_HTML" | grep -qE "竞拍|LIVE|进行中"; then pass "auction page has content"; else fail "auction page empty"; fi

echo ""
echo "=== 出价 API ==="
PROJECT_ID=$(cd /workspace && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'desc' } })
  .then(r => { console.log(r?.id ?? ''); return p.\$disconnect(); })
  .catch(() => process.exit(1));
" 2>/dev/null || echo "")

if [ -n "$PROJECT_ID" ]; then
  TOP_BID=$(cd /workspace && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const proj = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } });
  const top = Number(proj?.bids[0]?.amount ?? proj?.startPrice ?? 8000);
  const step = Number(proj?.bidStep ?? 200);
  console.log(top + step);
  await p.\$disconnect();
})();
" 2>/dev/null || echo "8200")
  BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$TOP_BID}")
  if echo "$BID_RESP" | grep -qE '"ok":true|"success":true'; then pass "bid placed ($TOP_BID)"; else fail "bid failed: $BID_RESP"; fi
else
  fail "no LIVE auction project in DB"
fi

echo ""
echo "=== 上传校验 ==="
UPLOAD_NO_FILE=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/upload" -F "file=" -w "\n%{http_code}" | tail -1)
if [ "$UPLOAD_NO_FILE" = "400" ]; then pass "upload missing file -> 400"; else fail "upload missing file -> $UPLOAD_NO_FILE"; fi

UPLOAD_JSON=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" \
  -d '{"file":"test"}' -w "\n%{http_code}")
UPLOAD_JSON_CODE=$(echo "$UPLOAD_JSON" | tail -1)
if [ "$UPLOAD_JSON_CODE" = "400" ]; then pass "upload non-multipart -> 400"; else fail "upload non-multipart -> $UPLOAD_JSON_CODE (want 400)"; fi

echo ""
echo "=== 第三方 token ==="
TP_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
if echo "$TP_RESP" | grep -q '"token"'; then pass "third-party token"; else fail "third-party token: $TP_RESP"; fi

echo ""
echo "=== 未授权上传 ==="
UNAUTH=$(curl -s -X POST "$BASE/api/upload" -F "file=@/dev/null" -w "\n%{http_code}" | tail -1)
if [ "$UNAUTH" = "401" ]; then pass "upload without auth -> 401"; else fail "upload without auth -> $UNAUTH"; fi

echo ""
echo "=== 结果: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
