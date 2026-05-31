#!/usr/bin/env bash
# API / 页面冒烟测试（需 dev server + 已 seed 的数据库）
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR" "${SSO_JAR:-}"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

# 公开页面
for path in / /m /m/login /admin/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  [[ "$code" == "200" ]] || fail "$path returned $code"
  ok "GET $path -> $code"
done

# 租户登录
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$LOGIN" | grep -q '"ok":true' || fail "tenant login: $LOGIN"
ok "tenant login"

# 管理端登录
ALOGIN=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$ALOGIN" | grep -q '"ok":true' || fail "admin login: $ALOGIN"
ok "admin login"

# 受保护页面（有 cookie 应 200）
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/me")
[[ "$code" == "200" ]] || fail "/m/me returned $code"
ok "GET /m/me with session"

code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin")
[[ "$code" == "200" ]] || fail "/admin returned $code"
ok "GET /admin with session"

# 演示竞拍出价（须在第三方 SSO 之前：SSO 会切换为另一用户会话）
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
async function main() {
  const p = new PrismaClient();
  const proj =
    (await p.auctionProject.findUnique({ where: { code: 'DEMO_AUCTION' } })) ??
    (await p.auctionProject.findFirst({
      where: { status: 'LIVE' },
      orderBy: { startsAt: 'desc' },
    }));
  console.log(proj?.id ?? '');
  await p.\$disconnect();
}
main();
" 2>/dev/null)
if [[ -n "$PROJECT_ID" ]]; then
  BID_RES=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":999999}')
  echo "$BID_RES" | grep -qE '"ok":true|"error":"出价需不低于' || fail "auction bid: $BID_RES"
  ok "auction bid API"
  code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction/$PROJECT_ID")
  [[ "$code" == "200" ]] || fail "/m/auction/$PROJECT_ID returned $code"
  ok "auction detail page"
fi

# 晒场预约
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
async function main() {
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
}
main();
" 2>/dev/null)
if [[ -n "$LISTING_ID" ]]; then
  DRY=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-09-01\",\"endDate\":\"2026-09-02\"}")
  echo "$DRY" | grep -qE '"ok":true|"error":"' || fail "drying reserve: $DRY"
  ok "drying reserve API"
fi

# 第三方 SSO dev token（使用独立 cookie，避免覆盖演示租户会话）
SSO_JAR=$(mktemp)
TP=$(curl -s "$BASE/api/dev/third-party-token")
TOKEN=$(echo "$TP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[[ -n "$TOKEN" ]] || fail "dev third-party token: $TP"
SSO=$(curl -s -c "$SSO_JAR" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
echo "$SSO" | grep -q '"ok":true' || fail "third-party auth: $SSO"
ok "third-party SSO"
rm -f "$SSO_JAR"

# 登出
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout" | grep -q '"ok":true' || fail "logout"
ok "tenant logout"

echo ""
echo "All smoke tests passed."
