#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
ERRORS=0
COOKIE_DIR=$(mktemp -d)
trap 'rm -rf "$COOKIE_DIR"' EXIT

fail() { echo "FAIL: $1"; ERRORS=$((ERRORS + 1)); }
pass() { echo "PASS: $1"; }

expect_status() {
  local name="$1" method="$2" path="$3" want="$4"
  shift 4
  local code body
  body=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE$path" "$@")
  code=$(echo "$body" | tail -n1)
  body=$(echo "$body" | sed '$d')
  if [[ "$code" != "$want" ]]; then
    fail "$name (expected HTTP $want, got $code) body=$body"
  else
    pass "$name"
  fi
}

echo "=== Functional tests against $BASE ==="

# Public pages
for path in / /m /m/auction /m/drying /admin/login; do
  expect_status "GET $path" GET "$path" 200
done

# Auth
expect_status "user login" POST /api/auth/login 200 \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' \
  -c "$COOKIE_DIR/user.txt"

expect_status "admin login" POST /api/auth/admin/login 200 \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' \
  -c "$COOKIE_DIR/admin.txt"

# Dev SSO token
expect_status "dev third-party token" GET "/api/dev/third-party-token?u_id=test123" 200

# Auction bid (requires LIVE demo auction from seed)
PROJECT_ID=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.auctionProject.findFirst({ orderBy: { createdAt: 'asc' } })
  .then((x) => { console.log(x?.id ?? ''); return p.\$disconnect(); });
")
if [[ -z "$PROJECT_ID" ]]; then
  fail "no auction project in database"
else
  BID_AMOUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const project = await p.auctionProject.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!project) return;
  const top = await p.auctionBid.findFirst({ where: { projectId: project.id }, orderBy: { amount: 'desc' } });
  const start = Number(project.startPrice);
  const step = Number(project.bidStep);
  const min = top ? Number(top.amount) + step : start;
  console.log(min);
  await p.\$disconnect();
})();
")
  BID_BODY=$(curl -s -b "$COOKIE_DIR/user.txt" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$BID_AMOUNT}")
  if echo "$BID_BODY" | grep -q '"ok":true'; then
    pass "auction bid"
  else
    fail "auction bid body=$BID_BODY"
  fi
fi

# Drying reserve + duplicate
LISTING_ID=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dryingFieldListing.findFirst()
  .then((x) => { console.log(x?.id ?? ''); return p.\$disconnect(); });
")
DATE_RANGE=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const dayStr = (d) => d.toISOString().slice(0, 10);
(async () => {
  const listing = await p.dryingFieldListing.findFirst();
  const user = await p.endUser.findUnique({ where: { phone: '13800138000' } });
  if (!listing || !user) return;
  const existing = await p.dryingReservation.findMany({
    where: { listingId: listing.id, endUserId: user.id, status: { notIn: ['REJECTED', 'CANCELLED'] } },
    select: { startDate: true, endDate: true },
  });
  const ranges = existing.map((r) => [dayStr(r.startDate), dayStr(r.endDate)]);
  const overlaps = (s, e) => ranges.some(([rs, re]) => rs <= e && re >= s);
  for (let i = 40; i < 200; i++) {
    const start = dayStr(new Date(Date.now() + i * 86400000));
    const end = dayStr(new Date(Date.now() + (i + 1) * 86400000));
    if (!overlaps(start, end)) {
      console.log(start + ',' + end);
      break;
    }
  }
  await p.\$disconnect();
})();
")
START=${DATE_RANGE%,*}
END=${DATE_RANGE#*,}
if [[ -z "$LISTING_ID" ]]; then
  fail "no drying listing in database"
else
  expect_status "drying reserve" POST /api/m/drying/reserve 200 \
    -b "$COOKIE_DIR/user.txt" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}"

  expect_status "drying reserve duplicate" POST /api/m/drying/reserve 409 \
    -b "$COOKIE_DIR/user.txt" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}"
fi

# Upload validation
expect_status "upload unauthenticated" POST /api/upload 401 \
  -F "file=@/dev/null;type=image/png"

expect_status "upload invalid type" POST /api/upload 400 \
  -b "$COOKIE_DIR/admin.txt" \
  -F "file=@/dev/null;type=text/plain"

expect_status "upload missing file" POST /api/upload 400 \
  -b "$COOKIE_DIR/admin.txt" \
  -H "Content-Type: multipart/form-data"

echo "=== Done: $ERRORS error(s) ==="
exit "$ERRORS"
