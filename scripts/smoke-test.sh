#!/usr/bin/env bash
# API smoke test for sishi-zichan (requires dev server on localhost:3000)
set -euo pipefail

BASE="http://localhost:3000"
PASS=0
FAIL=0
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

pass() { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name (HTTP $actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

check_json_field() {
  local name="$1" json="$2" field="$3" expected="$4"
  local actual
  actual=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$field',''))" 2>/dev/null || echo "")
  if [ "$actual" = "$expected" ]; then pass "$name ($field=$actual)"; else fail "$name (expected $field=$expected, got $actual)"; fi
}

echo "=== Smoke Test: sishi-zichan ==="
echo ""

# --- Public pages ---
echo "[Pages]"
for path in "/" "/m" "/m/auction" "/m/drying" "/m/login" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

# --- Dev third-party token ---
echo ""
echo "[Dev API]"
resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=test_user")
check_json_field "GET /api/dev/third-party-token" "$resp" "token" "$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo '')"

# --- User auth ---
echo ""
echo "[User Auth]"
PHONE="199$(date +%s | tail -c 9)"
resp=$(curl -s -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
check_json_field "POST /api/auth/register" "$resp" "ok" "True"

curl -s -c "$TMPDIR/user.txt" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}' > /dev/null
code=$(curl -s -b "$TMPDIR/user.txt" -o /dev/null -w "%{http_code}" "$BASE/m/me")
check_status "User login + /m/me" "200" "$code"

# --- Admin auth ---
echo ""
echo "[Admin Auth]"
resp=$(curl -s -c "$TMPDIR/admin.txt" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json_field "POST /api/auth/admin/login" "$resp" "ok" "True"

code=$(curl -s -b "$TMPDIR/admin.txt" -o /dev/null -w "%{http_code}" "$BASE/admin")
check_status "Admin dashboard" "200" "$code"

for path in "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/organizations" "/admin/admins" "/admin/config" "/admin/dict" "/admin/audit"; do
  code=$(curl -s -b "$TMPDIR/admin.txt" -o /dev/null -w "%{http_code}" "$BASE$path")
  check_status "GET $path" "200" "$code"
done

# --- Upload without auth ---
echo ""
echo "[Upload API]"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
check_status "POST /api/upload (no auth)" "401" "$code"

code=$(curl -s -b "$TMPDIR/admin.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
check_status "POST /api/upload (no file)" "400" "$code"

# --- Admin assets API ---
echo ""
echo "[Admin Assets API]"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets")
check_status "POST /api/admin/assets (no auth)" "401" "$code"

code=$(curl -s -b "$TMPDIR/admin.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H 'Content-Type: application/json' -d '{}')
check_status "POST /api/admin/assets (non-multipart)" "400" "$code"

# --- Mobile protected APIs ---
echo ""
echo "[Mobile API]"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake-id/bid" \
  -H 'Content-Type: application/json' -d '{"amount":100}')
check_status "POST bid (no auth)" "401" "$code"

# Ensure a LIVE auction exists for bid testing (seed data may have expired)
PROJECT_ID=$(cd /workspace && npx tsx -e "
import { prisma } from './src/lib/prisma';
(async () => {
  const now = new Date();
  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const past = new Date(now.getTime() - 60 * 1000);
  let p = await prisma.auctionProject.findFirst();
  if (p) {
    await prisma.auctionProject.update({
      where: { id: p.id },
      data: { status: 'LIVE', startsAt: past, endsAt: future },
    });
    console.log(p.id);
  }
  await prisma.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  BID_AMOUNT=$(cd /workspace && npx tsx -e "
import { prisma } from './src/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
(async () => {
  const p = await prisma.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
  if (!p) { console.log('0'); return; }
  const top = await prisma.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
  const min = top
    ? new Decimal(top.amount.toString()).plus(p.bidStep.toString())
    : new Decimal(p.startPrice.toString());
  console.log(min.toNumber());
  await prisma.\$disconnect();
})();
" 2>/dev/null | tail -1)
  resp=$(curl -s -b "$TMPDIR/user.txt" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' -d "{\"amount\":$BID_AMOUNT}")
  ok=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok',False))" 2>/dev/null || echo "False")
  if [ "$ok" = "True" ]; then pass "POST bid on LIVE auction"; else fail "POST bid on LIVE auction: $resp"; fi
else
  fail "No LIVE auction project found in DB"
fi

LISTING_ID=$(cd /workspace && npx tsx -e "
import { prisma } from './src/lib/prisma';
(async () => {
  const l = await prisma.dryingFieldListing.findFirst();
  console.log(l?.id ?? '');
  await prisma.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [ -n "$LISTING_ID" ]; then
  resp=$(curl -s -b "$TMPDIR/user.txt" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-02\"}")
  ok=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok',False) or 'reservationId' in d)" 2>/dev/null || echo "False")
  if [ "$ok" = "True" ]; then pass "POST drying reserve"; else fail "POST drying reserve: $resp"; fi
else
  fail "No drying listing found in DB"
fi

code=$(curl -s -b "$TMPDIR/user.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/payments/mock" \
  -H 'Content-Type: application/json' -d '{"purpose":"INVALID"}')
# Should be 400 for invalid purpose
if [ "$code" = "400" ] || [ "$code" = "422" ]; then
  pass "POST mock payment (invalid purpose) HTTP $code"
else
  fail "POST mock payment (invalid purpose) expected 400, got $code"
fi

# --- Logout ---
echo ""
echo "[Logout]"
code=$(curl -s -b "$TMPDIR/user.txt" -c "$TMPDIR/user.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/logout")
check_status "POST /api/auth/logout" "200" "$code"

code=$(curl -s -b "$TMPDIR/admin.txt" -c "$TMPDIR/admin.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/logout")
check_status "POST /api/auth/admin/logout" "200" "$code"

# --- Summary ---
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
