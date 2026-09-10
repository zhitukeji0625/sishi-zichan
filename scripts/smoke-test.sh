#!/usr/bin/env bash
# Functional smoke tests — run against a live dev server on localhost:3000
set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
ADMIN_COOKIE="/tmp/smoke_admin_cookies.txt"
USER_COOKIE="/tmp/smoke_user_cookies.txt"
ERRORS=0

fail() { echo "FAIL: $1"; ERRORS=$((ERRORS + 1)); }
ok() { echo "OK: $1"; }

echo "=== Smoke test against $BASE ==="

# --- Pages ---
for path in / /admin/login /m /m/login /m/register /m/auction /m/drying; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then ok "GET $path"; else fail "GET $path expected 200 got $code"; fi
done

# --- Admin login ---
rm -f "$ADMIN_COOKIE"
resp=$(curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$resp" | grep -q '"ok":true'; then ok "Admin login"; else fail "Admin login: $resp"; fi

for path in /admin /admin/assets /admin/auctions /admin/registrations /admin/announcements \
  /admin/organizations /admin/audit /admin/config /admin/dict /admin/drying /admin/admins; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" "$BASE$path")
  if [ "$code" = "200" ]; then ok "GET $path (admin)"; else fail "GET $path expected 200 got $code"; fi
done

# --- User login ---
rm -f "$USER_COOKIE"
resp=$(curl -s -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$resp" | grep -q '"ok":true'; then ok "User login"; else fail "User login: $resp"; fi

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" "$BASE/m/me")
if [ "$code" = "200" ]; then ok "GET /m/me"; else fail "GET /m/me expected 200 got $code"; fi

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" "$BASE/m/orders")
if [ "$code" = "200" ]; then ok "GET /m/orders"; else fail "GET /m/orders expected 200 got $code"; fi

# --- Invalid credentials ---
resp=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
if echo "$resp" | grep -qi 'error\|失败'; then ok "Invalid login rejected"; else fail "Invalid login: $resp"; fi

# --- Register validation ---
resp=$(curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d '{"phone":"abc","password":"x"}')
if echo "$resp" | grep -qi 'error\|无效'; then ok "Register validation"; else fail "Register bad input: $resp"; fi

# --- Third-party token (dev) ---
resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test")
if echo "$resp" | grep -q 'token'; then ok "Dev third-party token"; else fail "Third-party token: $resp"; fi

# --- Non-multipart upload/assets should return 400 not 500 ---
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
if [ "$code" = "400" ]; then ok "Upload rejects non-multipart (400)"; else fail "Upload non-multipart got $code"; fi

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_COOKIE" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
if [ "$code" = "400" ]; then ok "Asset create rejects non-multipart (400)"; else fail "Asset create non-multipart got $code"; fi

# --- Mock payment validation ---
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_COOKIE" -X POST "$BASE/api/m/payments/mock" \
  -H "Content-Type: application/json" -d '{"purpose":"AUCTION_DEPOSIT"}')
if [ "$code" = "400" ]; then ok "Mock payment validates params"; else fail "Mock payment got $code"; fi

# --- Auction list page contains project id ---
html=$(curl -s -b "$USER_COOKIE" "$BASE/m/auction")
project_id=$(echo "$html" | grep -oE 'c[a-z0-9]{20,}' | head -1 || true)
if [ -n "$project_id" ]; then
  ok "Auction list has project link ($project_id)"
else
  fail "Auction list missing project id"
fi

# --- Refresh demo auction (trigger via page load) ---
curl -s -b "$USER_COOKIE" "$BASE/m/auction" > /dev/null

# --- Auction bid ---
if [ -n "$project_id" ]; then
  bid_step=$(cd /workspace && npx tsx -e "
    import { PrismaClient } from '@prisma/client';
    const p = new PrismaClient();
    p.auctionProject.findUnique({ where: { id: '$project_id' }, select: { startPrice: true, bidStep: true, status: true } })
      .then(async (proj) => {
        if (!proj) { console.log('0'); return; }
        const top = await p.auctionBid.findFirst({ where: { projectId: '$project_id' }, orderBy: { amount: 'desc' } });
        const min = top ? Number(top.amount) + Number(proj.bidStep) : Number(proj.startPrice);
        console.log(min);
        await p.\$disconnect();
      });
  " 2>/dev/null | tail -1)
  if [ -n "$bid_step" ] && [ "$bid_step" != "0" ]; then
    resp=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$project_id/bid" \
      -H "Content-Type: application/json" -d "{\"amount\":$bid_step}")
    if echo "$resp" | grep -q '"ok":true'; then
      ok "Auction bid at min price ($bid_step)"
    else
      fail "Auction bid: $resp"
    fi
  else
    fail "Could not compute min bid for $project_id"
  fi
fi

# --- Drying reserve ---
listing_id=$(cd /workspace && npx tsx -e "
  import { PrismaClient } from '@prisma/client';
  const p = new PrismaClient();
  p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } })
    .then((l) => { console.log(l?.id ?? ''); return p.\$disconnect(); });
" 2>/dev/null | tail -1)
if [ -n "$listing_id" ]; then
  start=$(date -u -d '+3 days' +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
  end=$(date -u -d '+5 days' +%Y-%m-%d 2>/dev/null || date -u -v+5d +%Y-%m-%d)
  resp=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$listing_id\",\"startDate\":\"$start\",\"endDate\":\"$end\"}")
  if echo "$resp" | grep -q '"ok":true'; then ok "Drying reservation"; else fail "Drying reserve: $resp"; fi
else
  fail "No operating drying listing found"
fi

# --- New user registration ---
new_phone="199$(date +%s | tail -c 9)"
resp=$(curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$new_phone\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
if echo "$resp" | grep -q '"ok":true'; then ok "User registration ($new_phone)"; else fail "Register: $resp"; fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "SMOKE TEST FAILED: $ERRORS error(s)"
  exit 1
fi
echo "ALL SMOKE TESTS PASSED"
