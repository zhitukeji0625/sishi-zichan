#!/usr/bin/env bash
# End-to-end smoke tests for local dev server. Run from repo root: npm run test:smoke
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp}"
PAGE_FILE="$TMPDIR/smoke-page.html"
DICT_FILE="$TMPDIR/smoke-dict.html"
ADMIN_COOKIE="$TMPDIR/smoke-admin-cookies.txt"
USER_COOKIE="$TMPDIR/smoke-user-cookies.txt"

pass() { PASS=$((PASS + 1)); echo "PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

check_code() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name expected=$expected got=$actual"; fi
}

echo "Smoke tests against $BASE"

for path in "/" "/admin/login" "/m" "/m/login" "/m/auction" "/m/drying"; do
  code=$(curl -s -o "$PAGE_FILE" -w '%{http_code}' "$BASE$path")
  check_code "GET $path" "200" "$code"
done

code=$(curl -s -o /dev/null -w '%{http_code}' -L "$BASE/favicon.ico")
check_code "GET /favicon.ico" "200" "$code"

curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}' -o /dev/null

for path in "/admin/dict" "/admin/assets"; do
  code=$(curl -s -b "$ADMIN_COOKIE" -o "$PAGE_FILE" -w '%{http_code}' "$BASE$path")
  check_code "GET $path (admin)" "200" "$code"
done

curl -s -b "$ADMIN_COOKIE" -o "$DICT_FILE" "$BASE/admin/dict"
if grep -q 'asset_type' "$DICT_FILE"; then
  pass "/admin/dict contains asset_type"
else
  fail "/admin/dict missing asset_type"
fi

code=$(curl -s -w '%{http_code}' -o /dev/null -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
check_code "POST /api/auth/admin/login" "200" "$code"

code=$(curl -s -w '%{http_code}' -o /dev/null -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
check_code "POST /api/auth/login" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test123")
check_code "GET /api/dev/third-party-token" "200" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" \
  -H 'Content-Type: application/json' \
  -d '{}')
check_code "POST /api/upload (non-multipart)" "400" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" \
  -F 'file=@public/favicon.svg')
check_code "POST /api/upload (no auth)" "401" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/assets" \
  -H 'Content-Type: application/json' \
  -d '{}')
check_code "POST /api/admin/assets (no auth)" "401" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/demo/bid" \
  -H 'Content-Type: application/json' \
  -d '{"amount":100}')
check_code "POST /api/m/auction/bid (no auth)" "401" "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/sso?token=invalid")
check_code "GET /m/sso?token=invalid" "200" "$code"

curl -s -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}' -o /dev/null

PROJECT_ID=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const user = await p.endUser.findUnique({ where: { phone: '13800138000' } });
  const reg = await p.auctionRegistration.findFirst({
    where: { endUserId: user.id, status: 'APPROVED', depositPaid: true },
    include: { project: { include: { bids: { orderBy: { amount: 'desc' }, take: 1 } } } },
    orderBy: { createdAt: 'desc' },
  });
  if (!reg?.project || reg.project.status !== 'LIVE') process.exit(1);
  const top = reg.project.bids[0]?.amount ?? reg.project.startPrice;
  const next = Number(top) + Number(reg.project.bidStep);
  process.stdout.write(reg.project.id + ' ' + next);
  await p.\$disconnect();
})().catch(() => process.exit(1));
")

if [ -n "${PROJECT_ID:-}" ]; then
  BID_PROJECT_ID=$(echo "$PROJECT_ID" | awk '{print $1}')
  BID_AMOUNT=$(echo "$PROJECT_ID" | awk '{print $2}')
  code=$(curl -s -b "$USER_COOKIE" -o /tmp/smoke-bid.json -w '%{http_code}' -X POST "$BASE/api/m/auction/$BID_PROJECT_ID/bid" \
    -H 'Content-Type: application/json' \
    -d "{\"amount\":$BID_AMOUNT}")
  check_code "POST /api/m/auction/bid (demo user)" "200" "$code"
else
  fail "demo auction project not LIVE"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
