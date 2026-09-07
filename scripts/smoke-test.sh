#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp/smoke}"
mkdir -p "$TMPDIR"

pass() { echo "✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "✗ $1 — $2"; FAIL=$((FAIL + 1)); }

expect_code() {
  local name="$1" expect="$2" actual="$3"
  if [ "$actual" = "$expect" ]; then pass "$name"; else fail "$name" "expected HTTP $expect, got $actual"; fi
}

expect_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("ok") else 1)' 2>/dev/null; then
    pass "$name"
  else
    fail "$name" "response missing ok:true — $body"
  fi
}

echo "=== Smoke test @ $BASE ==="

# 1. Homepage
expect_code "GET /" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"

# 2. Admin login — bad credentials
expect_code "POST /api/auth/admin/login (bad creds)" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/login" \
    -H 'Content-Type: application/json' -d '{"phone":"x","password":"y"}')"

# 3. Admin login — success
ADMIN_BODY=$(curl -s -c "$TMPDIR/admin.txt" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')
expect_json_ok "POST /api/auth/admin/login" "$ADMIN_BODY"

# 4. User login — success
USER_BODY=$(curl -s -c "$TMPDIR/user.txt" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')
expect_json_ok "POST /api/auth/login" "$USER_BODY"

# 5. Bid without auth
expect_code "POST bid (no auth)" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/unknown/bid" \
    -H 'Content-Type: application/json' -d '{"amount":100}')"

# 6. Resolve live auction + next bid amount
AUCTION_INFO=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  await p.auctionProject.updateMany({ where: { status: 'ENDED' }, data: { status: 'LIVE', endsAt: new Date(Date.now()+7*86400000) } });
  const project = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'asc' } });
  if (!project) { console.log(''); return; }
  const top = await p.auctionBid.findFirst({ where: { projectId: project.id }, orderBy: { amount: 'desc' } });
  const start = Number(project.startPrice);
  const step = Number(project.bidStep);
  const current = top ? Number(top.amount) : start - step;
  const next = current + step;
  console.log(JSON.stringify({ id: project.id, next }));
}
main().finally(() => p.\$disconnect());
" 2>/dev/null)

PROJECT_ID=$(echo "$AUCTION_INFO" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("id",""))' 2>/dev/null || echo "")
NEXT_BID=$(echo "$AUCTION_INFO" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("next",8400))' 2>/dev/null || echo "8400")

if [ -n "$PROJECT_ID" ]; then
  BID_BODY=$(curl -s -b "$TMPDIR/user.txt" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' -d "{\"amount\":$NEXT_BID}")
  expect_json_ok "POST bid (auth, amount=$NEXT_BID)" "$BID_BODY"
else
  fail "POST bid (live project)" "no LIVE auction project found"
fi

# 7. Third-party dev token
expect_code "GET /api/dev/third-party-token" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=smoke")"

# 8. Upload without auth
expect_code "POST /api/upload (no auth)" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload")"

# 9. Upload non-multipart → 400
expect_code "POST /api/upload (non-multipart)" "400" \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$TMPDIR/admin.txt" -X POST "$BASE/api/upload" \
    -H 'Content-Type: application/json' -d '{}')"

# 10. Asset create non-multipart → 400
expect_code "POST /api/admin/assets (non-multipart)" "400" \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$TMPDIR/admin.txt" -X POST "$BASE/api/admin/assets" \
    -H 'Content-Type: application/json' -d '{}')"

# 11. Drying reservation
LISTING_ID=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
  .then(r => { console.log(r?.id ?? ''); })
  .finally(() => p.\$disconnect());
" 2>/dev/null)

if [ -n "$LISTING_ID" ]; then
  DRY_BODY=$(curl -s -b "$TMPDIR/user.txt" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-09-15\",\"endDate\":\"2026-09-17\"}")
  expect_json_ok "POST /api/m/drying/reserve" "$DRY_BODY"
else
  fail "POST /api/m/drying/reserve" "no OPERATING drying listing"
fi

# 12. Admin page redirect when not logged in
expect_code "GET /admin (redirect)" "307" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")"

# 13. Mobile pages
expect_code "GET /m" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
expect_code "GET /m/auction" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"

# 14. User logout
expect_code "POST /api/auth/logout" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$TMPDIR/user.txt" -X POST "$BASE/api/auth/logout")"

# 15. Admin logout
expect_code "POST /api/auth/admin/logout" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$TMPDIR/admin.txt" -X POST "$BASE/api/auth/admin/logout")"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
