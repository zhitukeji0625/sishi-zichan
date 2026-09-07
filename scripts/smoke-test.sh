#!/usr/bin/env bash
# API smoke tests — must run against `npm run dev` (not production build).
set -uo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/smoke_admin.txt"
USER_JAR="/tmp/smoke_user.txt"

pass() { echo "✓ $1"; PASS=$((PASS+1)); }
fail() { echo "✗ $1"; FAIL=$((FAIL+1)); }

json_ok() {
  python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null
}

# 1–4: public pages
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")" = "200" ] && pass "GET /" || fail "GET /"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")" = "200" ] && pass "GET /admin/login" || fail "GET /admin/login"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")" = "200" ] && pass "GET /m" || fail "GET /m"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")" = "307" ] && pass "GET /admin (no auth)" || fail "GET /admin (no auth)"

# 5: admin login
ADMIN_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
[ "$(echo "$ADMIN_RESP" | json_ok)" = "True" ] && pass "POST /api/auth/admin/login" || fail "POST /api/auth/admin/login"

# 6: admin dashboard
[ "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "$BASE/admin")" = "200" ] && pass "GET /admin (auth)" || fail "GET /admin (auth)"

# 7: user login
USER_RESP=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
[ "$(echo "$USER_RESP" | json_ok)" = "True" ] && pass "POST /api/auth/login" || fail "POST /api/auth/login"

# 8: user me page
[ "$(curl -s -b "$USER_JAR" -o /dev/null -w '%{http_code}' "$BASE/m/me")" = "200" ] && pass "GET /m/me" || fail "GET /m/me"

# 9: bid without auth
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/x/bid" -H 'Content-Type: application/json' -d '{"amount":8200}')" = "401" ] \
  && pass "POST bid (no auth)" || fail "POST bid (no auth)"

# 10–11: third-party SSO
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_user")
TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
[ -n "$TOKEN" ] && pass "GET /api/dev/third-party-token" || fail "GET /api/dev/third-party-token"
SSO_RESP=$(curl -s -c /tmp/smoke_sso.txt -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
[ "$(echo "$SSO_RESP" | json_ok)" = "True" ] && pass "POST /api/auth/third-party" || fail "POST /api/auth/third-party"

# 12–13: multipart validation
[ "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')" = "400" ] \
  && pass "POST /api/upload (non-multipart)" || fail "POST /api/upload (non-multipart)"
[ "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{}')" = "400" ] \
  && pass "POST /api/admin/assets (non-multipart)" || fail "POST /api/admin/assets (non-multipart)"

# 14: bid with auth
AUCTION_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
  .then(r => console.log(r?.id ?? ''))
  .finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)

if [ -n "$AUCTION_ID" ]; then
  NEXT_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.auctionProject.findUnique({ where: { id: '$AUCTION_ID' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } })
  .then(r => { const h = r?.bids[0]?.amount ?? r?.startPrice ?? 8000; console.log(Number(h) + Number(r?.bidStep ?? 200)); })
  .finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)
  BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$NEXT_BID}")
  [ "$(echo "$BID_RESP" | json_ok)" = "True" ] && pass "POST bid (valid)" || fail "POST bid (valid)"
  [ "$(curl -s -b "$USER_JAR" -o /dev/null -w '%{http_code}' "$BASE/m/auction/$AUCTION_ID")" = "200" ] \
    && pass "GET /m/auction/[id]" || fail "GET /m/auction/[id]"
else
  fail "No LIVE auction for bid test"
fi

# 15: drying reserve
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => console.log(r?.id ?? ''))
  .finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)
if [ -n "$LISTING_ID" ]; then
  DRY_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-07\"}")
  DRY_OK=$(echo "$DRY_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok', False) or '已预约' in d.get('error',''))" 2>/dev/null)
  [ "$DRY_OK" = "True" ] && pass "POST drying reserve" || fail "POST drying reserve"
else
  fail "No OPERATING drying listing"
fi

# 16–17: logout
LOGOUT_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/logout")
[ "$(echo "$LOGOUT_RESP" | json_ok)" = "True" ] && pass "POST /api/auth/admin/logout" || fail "POST /api/auth/admin/logout"

echo ""
echo "=== Smoke: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
