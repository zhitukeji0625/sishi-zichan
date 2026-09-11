#!/usr/bin/env bash
# API smoke tests — run against `npm run dev` on localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ADMIN_COOKIE=/tmp/smoke_admin_cookies.txt
USER_COOKIE=/tmp/smoke_user_cookies.txt
rm -f "$ADMIN_COOKIE" "$USER_COOKIE"

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name — expected $expected, got $actual"
    [[ -n "$body" ]] && echo "    body: $body"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok') is True" 2>/dev/null; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name — expected ok:true"
    echo "    body: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests @ $BASE ==="

# --- Public pages ---
for path in "/" "/admin/login" "/m" "/m/login" "/m/auction" "/m/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

# --- Admin login ---
body=$(curl -s -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' \
  -c "$ADMIN_COOKIE" -w "\n%{http_code}")
code=$(echo "$body" | tail -1)
json=$(echo "$body" | head -n -1)
assert_status "POST /api/auth/admin/login" "200" "$code"
assert_json_ok "admin login ok" "$json"

# --- User login ---
body=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' \
  -c "$USER_COOKIE" -w "\n%{http_code}")
code=$(echo "$body" | tail -1)
json=$(echo "$body" | head -n -1)
assert_status "POST /api/auth/login" "200" "$code"
assert_json_ok "user login ok" "$json"

# --- Third-party token (dev) ---
body=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_user" -w "\n%{http_code}")
code=$(echo "$body" | tail -1)
json=$(echo "$body" | head -n -1)
assert_status "GET /api/dev/third-party-token" "200" "$code"
TOKEN=$(echo "$json" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null || echo "")

# --- Third-party SSO ---
if [[ -n "$TOKEN" ]]; then
  body=$(curl -s -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}" -w "\n%{http_code}")
  code=$(echo "$body" | tail -1)
  json=$(echo "$body" | head -n -1)
  assert_status "POST /api/auth/third-party" "200" "$code"
  assert_json_ok "third-party SSO ok" "$json"
fi

# --- Register (unique phone) ---
PHONE="199$(date +%s | tail -c 9)"
body=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}" -w "\n%{http_code}")
code=$(echo "$body" | tail -1)
json=$(echo "$body" | head -n -1)
assert_status "POST /api/auth/register" "200" "$code"
assert_json_ok "register ok" "$json"

# --- Auth guards ---
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets")
assert_status "POST /api/admin/assets (no auth)" "401" "$code"

# --- Multipart error handling (should be 400, not 500) ---
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -b "$ADMIN_COOKIE" -d '{}')
assert_status "POST /api/upload (non-multipart)" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -b "$ADMIN_COOKIE" -d '{}')
assert_status "POST /api/admin/assets (non-multipart)" "400" "$code"

# --- Admin pages (authenticated) ---
for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/drying" "/admin/organizations"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path" -b "$ADMIN_COOKIE")
  assert_status "GET $path (admin)" "200" "$code"
done

# --- User pages (authenticated) ---
for path in "/m/me" "/m/orders"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path" -b "$USER_COOKIE")
  assert_status "GET $path (user)" "200" "$code"
done

# --- Drying reserve ---
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' }, select: { id: true } });
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [[ -n "$LISTING_ID" ]]; then
  body=$(curl -s -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" -b "$USER_COOKIE" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-11-01\",\"endDate\":\"2026-11-05\"}" -w "\n%{http_code}")
  code=$(echo "$body" | tail -1)
  json=$(echo "$body" | head -n -1)
  assert_status "POST /api/m/drying/reserve" "200" "$code"
  assert_json_ok "drying reserve ok" "$json"
else
  echo "  ⚠ skip drying reserve — no OPERATING listing"
fi

# --- Auction bid (set LIVE first, compute min bid) ---
BID_INFO=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const project = await p.auctionProject.findFirst({
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!project) { console.log(''); process.exit(0); }
  await p.auctionProject.update({
    where: { id: project.id },
    data: { status: 'LIVE', endsAt: new Date(Date.now() + 86400000) },
  });
  const top = project.bids[0]?.amount;
  const start = Number(project.startPrice);
  const step = Number(project.bidStep);
  const current = top ? Number(top) : start - step;
  const minBid = current + step;
  console.log(JSON.stringify({ id: project.id, minBid }));
  await p.\$disconnect();
})();
" 2>/dev/null)

if [[ -n "$BID_INFO" ]]; then
  PROJECT_ID=$(echo "$BID_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  MIN_BID=$(echo "$BID_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['minBid'])")
  body=$(curl -s -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -b "$USER_COOKIE" \
    -d "{\"amount\":$MIN_BID}" -w "\n%{http_code}")
  code=$(echo "$body" | tail -1)
  json=$(echo "$body" | head -n -1)
  assert_status "POST /api/m/auction/bid" "200" "$code"
  assert_json_ok "auction bid ok" "$json"
else
  echo "  ⚠ skip auction bid — no project"
fi

# --- Payment mock (duplicate rent should be 409) ---
RENT_PROJECT=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const user = await p.endUser.findUnique({ where: { phone: '13800138000' } });
  const result = await p.auctionResult.findFirst({
    where: { winnerId: user?.id, status: 'PUBLISHED' },
    select: { projectId: true },
  });
  console.log(result?.projectId ?? '');
  await p.\$disconnect();
})();
" 2>/dev/null)

if [[ -n "$RENT_PROJECT" ]]; then
  curl -s -o /dev/null -X POST "$BASE/api/m/payments/mock" \
    -H "Content-Type: application/json" -b "$USER_COOKIE" \
    -d "{\"purpose\":\"AUCTION_RENT\",\"auctionProjectId\":\"$RENT_PROJECT\"}" || true
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/payments/mock" \
    -H "Content-Type: application/json" -b "$USER_COOKIE" \
    -d "{\"purpose\":\"AUCTION_RENT\",\"auctionProjectId\":\"$RENT_PROJECT\"}")
  assert_status "POST /api/m/payments/mock (duplicate rent)" "409" "$code"
else
  echo "  ⚠ skip duplicate rent — no published winner project"
fi

# --- Invalid bid amount ---
if [[ -n "${PROJECT_ID:-}" ]]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -b "$USER_COOKIE" \
    -d '{"amount":1}')
  assert_status "POST /api/m/auction/bid (too low)" "400" "$code"
fi

# --- Unauthenticated bid ---
if [[ -n "${PROJECT_ID:-}" ]]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":99999}')
  assert_status "POST /api/m/auction/bid (no auth)" "401" "$code"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
