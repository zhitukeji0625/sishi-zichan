#!/usr/bin/env bash
# Functional smoke tests against local dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

fail=0
ok() { echo "  OK: $1"; }
err() { echo "  FAIL: $1"; fail=1; }

check_http() {
  local desc="$1" url="$2" expect="$3" jar="${4:-}"
  local curl_args=(-s -o /dev/null -w "%{http_code}")
  [[ -n "$jar" ]] && curl_args+=(-b "$jar")
  code=$(curl "${curl_args[@]}" "$url")
  if [[ "$code" == "$expect" ]]; then ok "$desc ($code)"; else err "$desc expected $expect got $code"; fi
}

echo "=== Ensure demo data (refresh ended demo auction) ==="
(cd /workspace && npm run db:seed 2>&1 | tail -3) || true

echo "=== Static pages ==="
for path in / /m /m/login /m/auction /m/drying /m/me /admin/login; do
  check_http "GET $path" "$BASE$path" 200
done

echo "=== Auth ==="
resp=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$resp" | grep -q '"ok":true' && ok "user login" || err "user login: $resp"

resp=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$resp" | grep -q '"ok":true' && ok "admin login" || err "admin login: $resp"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
[[ "$code" == "401" ]] && ok "bad password 401" || err "bad password expected 401 got $code"

echo "=== Third-party SSO (dev) ==="
token_resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test-user")
token=$(echo "$token_resp" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [[ -n "$token" ]]; then
  ok "dev third-party token"
  sso_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/sso?token=$token")
  [[ "$sso_code" == "200" || "$sso_code" == "302" ]] && ok "sso page $sso_code" || err "sso page $sso_code"
else
  err "dev third-party token: $token_resp"
fi

echo "=== Auction bid (authenticated) ==="
project_id=$(cd /workspace && node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.auctionProject.findFirst({ where: { status: 'LIVE' }, select: { id: true } })
    .then(r => { console.log(r?.id || ''); return p.\$disconnect(); });
")
if [[ -n "$project_id" ]]; then
  ok "found LIVE project $project_id"
  min_bid=$(cd /workspace && node -e "
    const { PrismaClient, Decimal } = require('@prisma/client');
    const p = new PrismaClient();
    (async () => {
      const proj = await p.auctionProject.findUnique({ where: { id: '$project_id' } });
      const top = await p.auctionBid.findFirst({ where: { projectId: '$project_id' }, orderBy: { amount: 'desc' } });
      const min = top ? Number(top.amount) + Number(proj.bidStep) : Number(proj.startPrice);
      console.log(min);
      await p.\$disconnect();
    })();
  ")
  bid_resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$project_id/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$min_bid}")
  echo "$bid_resp" | grep -q '"ok":true' && ok "bid success" || err "bid: $bid_resp"
  check_http "auction detail page" "$BASE/m/auction/$project_id" 200
else
  err "no LIVE auction project"
fi

echo "=== Drying reserve ==="
listing_id=$(cd /workspace && node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.dryingFieldListing.findFirst({ select: { id: true } })
    .then(r => { console.log(r?.id || ''); return p.\$disconnect(); });
")
if [[ -n "$listing_id" ]]; then
  check_http "drying detail" "$BASE/m/drying/$listing_id" 200
  tomorrow=$(date -u -d '+2 day' +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  reserve_resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$listing_id\",\"startDate\":\"$tomorrow\",\"endDate\":\"$tomorrow\"}")
  echo "$reserve_resp" | grep -q '"ok":true' && ok "reserve submitted" || err "reserve: $reserve_resp"
else
  err "no drying listing"
fi

echo "=== Admin protected ==="
check_http "admin dashboard" "$BASE/admin" 200 "$ADMIN_JAR"

echo "=== Register validation ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{}')
[[ "$code" == "400" ]] && ok "register empty 400" || err "register empty expected 400 got $code"

echo "=== Summary ==="
if [[ $fail -eq 0 ]]; then
  echo "All smoke tests passed."
  exit 0
else
  echo "Some smoke tests failed."
  exit 1
fi
