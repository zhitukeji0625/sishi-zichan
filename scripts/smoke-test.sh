#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp}/sishi-smoke"
mkdir -p "$TMPDIR"

check() {
  local name="$1" code="$2" expect="$3"
  if [ "$code" = "$expect" ]; then
    echo "✓ $name ($code)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (got $code, want $expect)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test against $BASE ==="

# Pages
check "homepage" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")" "200"
check "admin login page" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")" "200"
check "mobile home" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")" "200"
check "mobile auction list" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")" "200"
check "mobile drying list" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")" "200"

# Auth failures
check "user login bad creds" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"000","password":"x"}')" "401"
check "admin login bad creds" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"000","password":"x"}')" "401"

# Auth success
check "user login" "$(curl -s -o /dev/null -w '%{http_code}' -c "$TMPDIR/user.txt" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')" "200"
check "admin login" "$(curl -s -o /dev/null -w '%{http_code}' -c "$TMPDIR/admin.txt" -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')" "200"

# Protected routes
check "bid without auth" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/fake/bid" -H 'Content-Type: application/json' -d '{"amount":100}')" "401"

# Upload / assets non-multipart
check "upload non-multipart" "$(curl -s -o /dev/null -w '%{http_code}' -b "$TMPDIR/admin.txt" -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')" "400"
check "assets non-multipart" "$(curl -s -o /dev/null -w '%{http_code}' -b "$TMPDIR/admin.txt" -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{}')" "400"

# Dev token
check "dev third-party token" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test1")" "200"

# Register new user
NEW_PHONE="199$(date +%s | tail -c 9)"
REG_CODE=$(curl -s -o /dev/null -w '%{http_code}' -c "$TMPDIR/newuser.txt" -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$NEW_PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
check "user register ($NEW_PHONE)" "$REG_CODE" "200"

# Auction bid (dynamic project id + min amount)
AUCTION_DATA=$(./node_modules/.bin/tsx -e "
import { PrismaClient } from '@prisma/client';
(async () => {
  const p = new PrismaClient();
  const project = await p.auctionProject.findFirst({ where: { status: 'LIVE' }, include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } });
  if (!project) { console.log(''); await p.\$disconnect(); return; }
  const top = project.bids[0]?.amount ? Number(project.bids[0].amount) : Number(project.startPrice) - Number(project.bidStep);
  const minBid = top + Number(project.bidStep);
  console.log(JSON.stringify({ id: project.id, minBid }));
  await p.\$disconnect();
})();
" 2>/dev/null || echo "")

if [ -n "$AUCTION_DATA" ] && [ "$AUCTION_DATA" != '""' ]; then
  PROJECT_ID=$(echo "$AUCTION_DATA" | ./node_modules/.bin/tsx -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(d.id||'');")
  MIN_BID=$(echo "$AUCTION_DATA" | ./node_modules/.bin/tsx -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(String(d.minBid||''));")
  if [ -n "$PROJECT_ID" ] && [ -n "$MIN_BID" ]; then
    BID_CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$TMPDIR/user.txt" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
      -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}")
    check "auction bid ($MIN_BID)" "$BID_CODE" "200"
  else
    echo "⊘ auction bid (no LIVE project)"
  fi
else
  echo "⊘ auction bid (no LIVE project)"
fi

# Drying reservation
LISTING_ID=$(./node_modules/.bin/tsx -e "
import { PrismaClient } from '@prisma/client';
(async () => {
  const p = new PrismaClient();
  const listing = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  console.log(listing?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null || echo "")

if [ -n "$LISTING_ID" ]; then
  START=$(date -d '+5 days' +%Y-%m-%d 2>/dev/null || date -v+5d +%Y-%m-%d)
  END=$(date -d '+6 days' +%Y-%m-%d 2>/dev/null || date -v+6d +%Y-%m-%d)
  DRY_CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$TMPDIR/user.txt" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check "drying reserve ($START to $END)" "$DRY_CODE" "200"
else
  echo "⊘ drying reserve (no OPERATING listing)"
fi

# Logout
check "user logout" "$(curl -s -o /dev/null -w '%{http_code}' -b "$TMPDIR/user.txt" -X POST "$BASE/api/auth/logout")" "200"
check "admin logout" "$(curl -s -o /dev/null -w '%{http_code}' -b "$TMPDIR/admin.txt" -X POST "$BASE/api/auth/admin/logout")" "200"

echo "--- Results: $PASS passed, $FAIL failed ---"
[ "$FAIL" -eq 0 ]
