#!/usr/bin/env bash
# API smoke tests — run against `npm run dev` (not production start).
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp/smoke-test}"
mkdir -p "$TMPDIR"

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name — $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests against $BASE ==="

# 1. Public pages
assert_status "Homepage" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
assert_status "Admin login page" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
assert_status "Mobile page" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
assert_status "Favicon" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/favicon.svg")"

# 2. Admin redirect without login
assert_status "Admin redirect (no auth)" 307 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")"

# 3. Admin login
ADMIN_BODY=$(curl -s -c "$TMPDIR/admin.txt" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "Admin login" "$ADMIN_BODY"

# 4. User login
USER_BODY=$(curl -s -c "$TMPDIR/user.txt" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "User login" "$USER_BODY"

# 5. Third-party token (dev only)
TP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=smoke_test")
assert_status "Third-party token" 200 "$TP_STATUS"

# 6. Upload non-multipart → 400
assert_status "Upload non-multipart" 400 "$(curl -s -b "$TMPDIR/admin.txt" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" \
  -H 'Content-Type: application/json' -d '{"file":"test"}')"

# 7. Admin assets non-multipart → 400
assert_status "Admin assets non-multipart" 400 "$(curl -s -b "$TMPDIR/admin.txt" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/assets" \
  -H 'Content-Type: application/json' -d '{"name":"test"}')"

# 8. Bid without auth → 401
assert_status "Bid without auth" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/invalid/bid" \
  -H 'Content-Type: application/json' -d '{"amount":1000}')"

# 9. Trigger demo auction refresh via page load
curl -s "$BASE/m/auction" > /dev/null

# 10. Get live auction ID and min bid
AUCTION_INFO=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const project = await p.auctionProject.findFirst({
    where: { status: 'LIVE' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!project) { console.log('{}'); return; }
  const top = project.bids[0]?.amount;
  const min = top
    ? Number(top) + Number(project.bidStep)
    : Number(project.startPrice);
  console.log(JSON.stringify({ id: project.id, minBid: min }));
  await p.\$disconnect();
})();
")
AUCTION_ID=$(echo "$AUCTION_INFO" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.id||'')")
MIN_BID=$(echo "$AUCTION_INFO" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(String(d.minBid||''))")

if [ -n "$AUCTION_ID" ] && [ -n "$MIN_BID" ]; then
  BID_BODY=$(curl -s -b "$TMPDIR/user.txt" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  assert_json_ok "Place bid" "$BID_BODY"
else
  echo "  FAIL: No LIVE auction found for bid test"
  FAIL=$((FAIL + 1))
fi

# 11. Drying reservation
LISTING_ID=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } })
  .then(l => { console.log(l?.id || ''); p.\$disconnect(); });
")
START=$(date -u +%Y-%m-%d)
END=$(date -u -d "+3 days" +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
RESERVE_BODY=$(curl -s -b "$TMPDIR/user.txt" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" \
  -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
assert_json_ok "Drying reservation" "$RESERVE_BODY"

# 12. User logout
LOGOUT_STATUS=$(curl -s -b "$TMPDIR/user.txt" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/logout")
assert_status "User logout" 200 "$LOGOUT_STATUS"

# 13. Admin logout
ADMIN_LOGOUT=$(curl -s -b "$TMPDIR/admin.txt" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/logout")
assert_status "Admin logout" 200 "$ADMIN_LOGOUT"

# 14. Register duplicate phone → 409
REG_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_status "Register duplicate phone" 409 "$REG_STATUS"

# 15. Invalid login → 401
assert_status "Invalid login" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"wrong"}')"

# 16. Third-party auth
TP_TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_sso" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.token||'')")
if [ -n "$TP_TOKEN" ]; then
  SSO_BODY=$(curl -s -c "$TMPDIR/sso.txt" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TP_TOKEN\"}")
  assert_json_ok "Third-party SSO login" "$SSO_BODY"
else
  echo "  FAIL: Could not get third-party token"
  FAIL=$((FAIL + 1))
fi

# 17. Mobile auction page
assert_status "Mobile auction page" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"

# 18. Mobile drying page
assert_status "Mobile drying page" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
