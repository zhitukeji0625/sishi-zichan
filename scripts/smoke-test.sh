#!/usr/bin/env bash
# Smoke test for core API flows
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

fail() { echo "FAIL: $1"; exit 1; }
ok() { echo "OK: $1"; }

# --- Public pages ---
for path in / /m /m/login /admin/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  [[ "$code" == "200" ]] || fail "$path returned $code"
  ok "GET $path -> $code"
done

# --- End user login ---
LOGIN=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$LOGIN" | grep -q '"ok":true' || fail "user login: $LOGIN"
ok "POST /api/auth/login"

# --- Protected mobile pages (with cookie) ---
for path in /m/me /m/auction /m/orders /m/drying; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path")
  [[ "$code" == "200" ]] || fail "$path (authed) returned $code"
  ok "GET $path (authed) -> $code"
done

# --- Admin login ---
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT
ALOGIN=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$ALOGIN" | grep -q '"ok":true' || fail "admin login: $ALOGIN"
ok "POST /api/auth/admin/login"

for path in /admin /admin/assets /admin/auctions /admin/registrations /admin/audit; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  [[ "$code" == "200" ]] || fail "$path (admin) returned $code"
  ok "GET $path (admin) -> $code"
done

# --- Third-party token (dev) ---
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
echo "$TOKEN_RESP" | grep -q 'token' || fail "third-party token: $TOKEN_RESP"
TOKEN=$(echo "$TOKEN_RESP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[[ -n "$TOKEN" ]] || fail "could not parse token"
ok "GET /api/dev/third-party-token"

SSO_JAR=$(mktemp)
SSO_CODE=$(curl -s -o /dev/null -w "%{http_code}" -c "$SSO_JAR" -L "$BASE/m/sso?token=$TOKEN")
[[ "$SSO_CODE" == "200" ]] || fail "/m/sso returned $SSO_CODE"
ok "GET /m/sso?token=..."

# --- Live auction bid (demo user) ---
LIVE_ID=$(cd /workspace && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const live = await p.auctionProject.findFirst({
    where: { status: 'LIVE', endsAt: { gt: new Date() } },
    select: { id: true, startPrice: true, bidStep: true },
  });
  if (live) {
    const top = await p.auctionBid.findFirst({
      where: { projectId: live.id },
      orderBy: { amount: 'desc' },
      select: { amount: true },
    });
    const min = top
      ? Number(top.amount) + Number(live.bidStep)
      : Number(live.startPrice);
    console.log(live.id + ' ' + min);
  }
  await p.\$disconnect();
})();
" 2>/dev/null | tail -1)
if [[ -z "$LIVE_ID" || "$LIVE_ID" != *" "* ]]; then
  ok "no live auction to bid (skipped)"
else
  PID=$(echo "$LIVE_ID" | awk '{print $1}')
  AMOUNT=$(echo "$LIVE_ID" | awk '{print $2}')
  BID=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$AMOUNT}")
  echo "$BID" | grep -q '"ok":true' || fail "auction bid: $BID"
  ok "POST /api/m/auction/$PID/bid"
fi

echo ""
echo "All smoke tests passed."
