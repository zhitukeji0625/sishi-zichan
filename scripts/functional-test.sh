#!/usr/bin/env bash
# Smoke tests for core API flows. Requires dev server at BASE (default http://localhost:3000).
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
PASS=0
FAIL=0
USER_JAR="/tmp/ft_user_cookies.txt"
ADMIN_JAR="/tmp/ft_admin_cookies.txt"
rm -f "$USER_JAR" "$ADMIN_JAR"

pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; [ -n "${2:-}" ] && echo "    $2"; }

check_http() {
  local name="$1" url="$2" expect="$3" extra="${4:-}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" $extra "$url")
  if [ "$code" = "$expect" ]; then pass "$name ($code)"; else fail "$name" "expected $expect, got $code"; fi
}

echo "=== Functional tests @ $BASE ==="

echo "[Pages]"
check_http "Home" "$BASE/" 200
check_http "Admin login page" "$BASE/admin/login" 200
check_http "Mobile home" "$BASE/m" 200
check_http "Admin redirect (no auth)" "$BASE/admin" 307

echo "[Auth]"
ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
echo "$ADMIN_RESP" | grep -q '"ok":true' && pass "Admin login" || fail "Admin login" "$ADMIN_RESP"

USER_RESP=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
echo "$USER_RESP" | grep -q '"ok":true' && pass "User login" || fail "User login" "$USER_RESP"

echo "[Protected pages]"
check_http "Admin dashboard" "$BASE/admin" 200 "-b $ADMIN_JAR"
check_http "Admin assets" "$BASE/admin/assets" 200 "-b $ADMIN_JAR"
check_http "Mobile auction" "$BASE/m/auction" 200 "-b $USER_JAR"
check_http "Mobile drying" "$BASE/m/drying" 200 "-b $USER_JAR"

echo "[API]"
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
  import { PrismaClient } from '@prisma/client';
  const p = new PrismaClient();
  p.auctionProject.findFirst({ where: { status: 'LIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true } })
    .then(r => { console.log(r?.id ?? ''); })
    .finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)

if [ -n "$PROJECT_ID" ]; then
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx -e "
    import { PrismaClient, Decimal } from '@prisma/client';
    const p = new PrismaClient();
    async function main() {
      const project = await p.auctionProject.findUnique({ where: { id: '$PROJECT_ID' } });
      if (!project) return;
      const top = await p.auctionBid.findFirst({ where: { projectId: '$PROJECT_ID' }, orderBy: { amount: 'desc' } });
      const min = top
        ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
        : new Decimal(project.startPrice.toString());
      console.log(min.toFixed(2));
    }
    main().finally(() => p.\$disconnect());
  " 2>/dev/null | tail -1)
  BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  echo "$BID_RESP" | grep -q '"ok":true' && pass "Auction bid" || fail "Auction bid" "$BID_RESP"
else
  fail "Auction bid" "no LIVE project found"
fi

UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/x/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
[ "$UNAUTH" = "401" ] && pass "Bid requires auth (401)" || fail "Bid requires auth" "got $UNAUTH"

TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=ft_user" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)
if [ -n "$TOKEN" ]; then
  SSO=$(curl -s -X POST "$BASE/api/auth/third-party" -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
  echo "$SSO" | grep -q '"ok":true' && pass "Third-party SSO" || fail "Third-party SSO" "$SSO"
else
  fail "Third-party SSO" "no token"
fi

LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
  import { PrismaClient } from '@prisma/client';
  const p = new PrismaClient();
  p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
    .then(r => { console.log(r?.id ?? ''); })
    .finally(() => p.\$disconnect());
" 2>/dev/null | tail -1)
if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+5 days" +%Y-%m-%d 2>/dev/null || date -v+5d +%Y-%m-%d)
  DRY=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  echo "$DRY" | grep -q '"ok":true' && pass "Drying reservation" || fail "Drying reservation" "$DRY"
else
  fail "Drying reservation" "no operating listing"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
