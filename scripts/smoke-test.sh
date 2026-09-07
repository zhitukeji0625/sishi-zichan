#!/usr/bin/env bash
# API smoke tests — run against `npm run dev` (not production `npm start`).
set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp}"

pass() { echo "✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "✗ $1"; FAIL=$((FAIL + 1)); }

expect_code() {
  local name="$1" url="$2" expected="$3" extra_args="${4:-}"
  local code
  code=$(eval "curl -s -o /dev/null -w '%{http_code}' $extra_args '$url'")
  if [ "$code" = "$expected" ]; then pass "$name ($code)"; else fail "$name (expected $expected, got $code)"; fi
}

expect_post_json() {
  local name="$1" url="$2" data="$3" expected="$4" cookie="${5:-}"
  local code resp
  if [ -n "$cookie" ]; then
    resp=$(curl -s -b "$cookie" -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$url")
  else
    resp=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$url")
  fi
  code=$(echo "$resp" | tail -1)
  if [ "$code" = "$expected" ]; then pass "$name ($code)"; else fail "$name (expected $expected, got $code)"; echo "$resp" | sed '$d' | head -c 200; echo; fi
}

echo "=== Smoke test @ $BASE ==="

# Pages
expect_code "Homepage" "$BASE/" "200"
expect_code "Admin login" "$BASE/admin/login" "200"
expect_code "Mobile H5" "$BASE/m" "200"
expect_code "Favicon" "$BASE/favicon.svg" "200"

# Auth
expect_post_json "Admin login valid" "$BASE/api/auth/admin/login" '{"phone":"13900000001","password":"admin123"}' "200"
expect_post_json "Admin login invalid" "$BASE/api/auth/admin/login" '{"phone":"13900000001","password":"wrong"}' "401"
expect_post_json "User login valid" "$BASE/api/auth/login" '{"phone":"13800138000","password":"user123"}' "200"
expect_post_json "User login invalid" "$BASE/api/auth/login" '{"phone":"13800138000","password":"wrong"}' "401"

# Sessions
curl -s -c "$TMPDIR/smoke_admin.txt" -X POST -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' "$BASE/api/auth/admin/login" > /dev/null
curl -s -c "$TMPDIR/smoke_user.txt" -X POST -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' "$BASE/api/auth/login" > /dev/null

expect_code "Admin assets (auth)" "$BASE/admin/assets" "200" "-b $TMPDIR/smoke_admin.txt"
expect_code "User me (auth)" "$BASE/m/me" "200" "-b $TMPDIR/smoke_user.txt"
expect_code "Admin assets (no auth)" "$BASE/admin/assets" "307"

# Multipart validation (must be 400, not 500)
code=$(curl -s -b "$TMPDIR/smoke_admin.txt" -o /dev/null -w "%{http_code}" \
  -X POST -H "Content-Type: application/json" -d '{}' "$BASE/api/upload")
[ "$code" = "400" ] && pass "Upload rejects JSON ($code)" || fail "Upload rejects JSON (expected 400, got $code)"

code=$(curl -s -b "$TMPDIR/smoke_admin.txt" -o /dev/null -w "%{http_code}" \
  -X POST -H "Content-Type: application/json" \
  -d '{"orgId":"x","type":"LAND","name":"t","locationText":"t"}' "$BASE/api/admin/assets")
[ "$code" = "400" ] && pass "Asset create rejects JSON ($code)" || fail "Asset create rejects JSON (expected 400, got $code)"

# Third-party token (dev only)
expect_code "Dev third-party token" "$BASE/api/dev/third-party-token?u_id=smoke" "200"

# Drying reserve
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst();
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)
if [ -n "$LISTING_ID" ]; then
  expect_post_json "Drying reserve" "$BASE/api/m/drying/reserve" \
    "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-03\"}" \
    "200" "$TMPDIR/smoke_user.txt"
else
  fail "Drying listing not found in DB"
fi

# Auction bid (dynamic next bid)
LIVE_PROJECT=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({
    where: { status: 'LIVE' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!proj) { console.log(''); await p.\$disconnect(); return; }
  const top = proj.bids[0]?.amount ?? proj.startPrice;
  const next = Number(top) + Number(proj.bidStep);
  console.log(proj.id + ' ' + next);
  await p.\$disconnect();
})();
" 2>/dev/null)
if [ -n "$LIVE_PROJECT" ]; then
  PROJECT_ID=$(echo "$LIVE_PROJECT" | awk '{print $1}')
  BID_AMOUNT=$(echo "$LIVE_PROJECT" | awk '{print $2}')
  expect_post_json "Auction bid" "$BASE/api/m/auction/$PROJECT_ID/bid" \
    "{\"amount\":$BID_AMOUNT}" "200" "$TMPDIR/smoke_user.txt"
else
  fail "No LIVE auction project found"
fi

# Logout
expect_post_json "User logout" "$BASE/api/auth/logout" "" "200" "$TMPDIR/smoke_user.txt"
expect_post_json "Admin logout" "$BASE/api/auth/admin/logout" "" "200" "$TMPDIR/smoke_admin.txt"

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
