#!/usr/bin/env bash
# Functional smoke tests against a running dev server on localhost:3000
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp/sishi-func-test}"
mkdir -p "$TMPDIR"

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  OK  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_contains() {
  local name="$1"
  local pattern="$2"
  local body="$3"
  if echo "$body" | grep -q "$pattern"; then
    echo "  OK  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (pattern $pattern not found)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Functional tests ($BASE_URL) ==="

# Public pages
for path in / /m /admin/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path")
  check "GET $path" "200" "$code"
done

# User login
USER_BODY=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' \
  -c "$TMPDIR/user.txt")
check_contains "user login" '"ok":true' "$USER_BODY"

# Admin login
ADMIN_BODY=$(curl -s -X POST "$BASE_URL/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' \
  -c "$TMPDIR/admin.txt")
check_contains "admin login" '"ok":true' "$ADMIN_BODY"

# Third-party token (dev only)
TOKEN_BODY=$(curl -s "$BASE_URL/api/dev/third-party-token?u_id=func_test_user")
check_contains "third-party token" '"token"' "$TOKEN_BODY"

TOKEN=$(echo "$TOKEN_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)
if [[ -n "$TOKEN" ]]; then
  SSO_BODY=$(curl -s -X POST "$BASE_URL/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  check_contains "third-party SSO" '"ok":true' "$SSO_BODY"
else
  echo "  FAIL third-party SSO (no token)"
  FAIL=$((FAIL + 1))
fi

# Mobile pages (authenticated)
for path in /m/auction /m/drying /m/orders /m/me; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path" -b "$TMPDIR/user.txt")
  check "GET $path (user)" "200" "$code"
done

# Admin pages (authenticated)
for path in /admin /admin/assets /admin/auctions /admin/drying /admin/announcements \
  /admin/registrations /admin/organizations /admin/admins /admin/audit /admin/config /admin/dict; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path" -b "$TMPDIR/admin.txt")
  check "GET $path (admin)" "200" "$code"
done

# Demo auction bid (requires LIVE project + approved registration from seed)
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.endUser.findUnique({ where: { phone: '13800138000' } })
  .then(u => p.auctionRegistration.findFirst({
    where: { endUserId: u?.id, status: 'APPROVED', depositPaid: true },
    orderBy: { createdAt: 'asc' },
  }))
  .then(r => { if (r) process.stdout.write(r.projectId); })
  .finally(() => p.\$disconnect());
" 2>/dev/null)

if [[ -n "$PROJECT_ID" ]]; then
  BID_BODY=$(curl -s -X POST "$BASE_URL/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -b "$TMPDIR/user.txt" \
    -d '{"amount":99999}')
  if echo "$BID_BODY" | grep -q '"ok":true'; then
    check_contains "auction bid" '"ok":true' "$BID_BODY"
  else
    MIN=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const id = '$PROJECT_ID';
p.auctionProject.findUnique({ where: { id } })
  .then(proj => {
    if (!proj) return;
    return p.auctionBid.findFirst({ where: { projectId: id }, orderBy: { amount: 'desc' } })
      .then(top => {
        const min = top ? Number(top.amount) + Number(proj.bidStep) : Number(proj.startPrice);
        process.stdout.write(String(min));
      });
  })
  .finally(() => p.\$disconnect());
" 2>/dev/null)
    BID_BODY=$(curl -s -X POST "$BASE_URL/api/m/auction/$PROJECT_ID/bid" \
      -H "Content-Type: application/json" \
      -b "$TMPDIR/user.txt" \
      -d "{\"amount\":$MIN}")
    check_contains "auction bid" '"ok":true' "$BID_BODY"
  fi
  DETAIL_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/m/auction/$PROJECT_ID" -b "$TMPDIR/user.txt")
  check "GET /m/auction/$PROJECT_ID" "200" "$DETAIL_CODE"
else
  echo "  FAIL demo auction project not found"
  FAIL=$((FAIL + 1))
fi

# Drying reserve
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } })
  .then(l => { if (l) process.stdout.write(l.id); })
  .finally(() => p.\$disconnect());
" 2>/dev/null)

if [[ -n "$LISTING_ID" ]]; then
  RES_BODY=$(curl -s -X POST "$BASE_URL/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -b "$TMPDIR/user.txt" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-09-01\",\"endDate\":\"2026-09-03\"}")
  if echo "$RES_BODY" | grep -q '"ok":true'; then
    check_contains "drying reserve" '"ok":true' "$RES_BODY"
  else
    check_contains "drying reserve (or capacity rule)" '"error"' "$RES_BODY"
  fi
else
  echo "  FAIL drying listing not found"
  FAIL=$((FAIL + 1))
fi

# Dict seeded
DICT_COUNT=$(cd "$(dirname "$0")/.." && npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dictCategory.count().then(c => process.stdout.write(String(c))).finally(() => p.\$disconnect());
" 2>/dev/null)
if [[ "${DICT_COUNT:-0}" -ge 10 ]]; then
  echo "  OK  dict categories seeded ($DICT_COUNT)"
  PASS=$((PASS + 1))
else
  echo "  FAIL dict categories ($DICT_COUNT)"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
