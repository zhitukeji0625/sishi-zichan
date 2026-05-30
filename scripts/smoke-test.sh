#!/bin/bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/sishi-smoke-cookies.txt"
ADMIN_JAR="/tmp/sishi-smoke-admin-cookies.txt"
rm -f "$COOKIE_JAR" "$ADMIN_JAR"

fail() { echo "FAIL: $1"; exit 1; }
ok() { echo "OK: $1"; }

# Public pages
for path in / /admin/login /m /m/login /m/auction /m/drying /m/orders; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  [ "$code" = "200" ] || fail "GET $path returned $code"
done
ok "public pages"

# User login
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$LOGIN" | grep -q '"ok":true' || fail "user login: $LOGIN"
ok "user login"

# User session page
code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/me")
[ "$code" = "200" ] || fail "GET /m/me returned $code"
ok "user /m/me"

# Admin login
ALOGIN=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$ALOGIN" | grep -q '"ok":true' || fail "admin login: $ALOGIN"
ok "admin login"

# Admin dashboard
code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin")
[ "$code" = "200" ] || fail "GET /admin returned $code"
ok "admin dashboard"

# Admin assets list
code=$(curl -s -b "$ADMIN_JAR" -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
[ "$code" = "200" ] || fail "GET /admin/assets returned $code"
ok "admin assets"

# Third-party dev token
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
TOKEN=$(echo "$TOKEN_RESP" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$TOKEN" ] || fail "third-party token: $TOKEN_RESP"
ok "dev third-party token"

# SSO page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$TOKEN")
[ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "302" ] || fail "SSO returned $code"
ok "sso page"

# Third-party auth API
TP=$(curl -s -c /tmp/sishi-tp-cookies.txt -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
echo "$TP" | grep -q '"ok":true' || fail "third-party auth: $TP"
ok "third-party auth"

# Demo user can bid when a LIVE project exists (seed ensures one)
LIVE_ID=$(cd /workspace && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.endUser.findUnique({ where: { phone: '13800138000' } }).then(async (u) => {
  if (!u) { console.log(''); return; }
  const proj = await p.auctionProject.findFirst({
    where: { status: 'LIVE', endsAt: { gt: new Date() }, registrations: { some: { endUserId: u.id, status: 'APPROVED', depositPaid: true } } },
    select: { id: true },
  });
  console.log(proj?.id ?? '');
}).finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)
if [ -n "$LIVE_ID" ]; then
  BID=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$LIVE_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":99999999}')
  echo "$BID" | grep -q '"ok":true\|"error":"出价需不低于' || fail "live bid: $BID"
  ok "demo live auction bid"
fi

echo ""
echo "All smoke tests passed."
