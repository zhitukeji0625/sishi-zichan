#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_json_ok() {
  local name="$1" resp="$2"
  if echo "$resp" | grep -q '"ok":true'; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name ($resp)"
    FAIL=$((FAIL + 1))
  fi
}

# Ensure at least one LIVE auction for bid tests
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const live = await p.auctionProject.count({ where: { status: 'LIVE' } });
  if (live === 0) {
    await p.auctionProject.updateMany({
      data: { status: 'LIVE', endsAt: new Date(Date.now() + 7 * 86400000) },
    });
    console.log('Reset auction projects to LIVE');
  }
  await p.\$disconnect();
})();
" 2>/dev/null || true

echo "=== Page smoke tests ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/m/me" "/m/orders" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

echo ""
echo "=== Auth ==="
resp=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_json_ok "user login" "$resp"

resp=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json_ok "admin login" "$resp"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
check "user login wrong password" "401" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123","name":"dup"}')
check "register duplicate phone" "409" "$code"

echo ""
echo "=== Upload / assets validation ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload")
check "upload no multipart" "400" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets")
check "admin assets no multipart" "400" "$code"

ASSET_ID=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.asset.findFirst().then((r) => { console.log(r?.id || ''); return p.\$disconnect(); });
")
if [ -n "$ASSET_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets/$ASSET_ID")
  check "admin asset update no multipart" "400" "$code"
fi

echo ""
echo "=== Auction bid ==="
read -r PROJECT_ID MIN_BID <<<"$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const project = await p.auctionProject.findFirst({
    where: { status: 'LIVE' },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });
  if (!project) { console.log(' '); await p.\$disconnect(); return; }
  const top = project.bids[0]?.amount ? Number(project.bids[0].amount) : Number(project.startPrice);
  const min = top + Number(project.bidStep);
  console.log(project.id, min);
  await p.\$disconnect();
})();
")"
if [ -n "$PROJECT_ID" ]; then
  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  check_json_ok "place bid at min ($MIN_BID)" "$resp"
else
  echo "SKIP: no LIVE auction project"
fi

echo ""
echo "=== Drying reservation ==="
read -r LISTING_ID START END <<<"$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const listing = await p.dryingFieldListing.findFirst({ where: { status: 'OPERATING' } });
  if (!listing) { console.log(''); await p.\$disconnect(); return; }
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 30);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 2);
  const fmt = (d) => d.toISOString().slice(0, 10);
  console.log(listing.id, fmt(start), fmt(end));
  await p.\$disconnect();
})();
")"
if [ -n "$LISTING_ID" ]; then
  resp=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check_json_ok "drying reserve" "$resp"
else
  echo "SKIP: no OPERATING drying listing"
fi

echo ""
echo "=== Dev SSO token ==="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=testuser")
check "dev third-party token" "200" "$code"

token=$(curl -s "$BASE/api/dev/third-party-token?u_id=testuser" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch{console.log('')}})")
if [ -n "$token" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$token\"}")
  check "third-party auth" "200" "$code"
fi

echo ""
echo "=== Logout ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
check "user logout" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
check "admin logout" "200" "$code"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
