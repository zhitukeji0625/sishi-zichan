#!/usr/bin/env bash
# API smoke tests — requires dev server at BASE (default http://localhost:3000)
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/sishi-user-cookies.txt}"
ADMIN_JAR="${ADMIN_JAR:-/tmp/sishi-admin-cookies.txt}"
PASS=0
FAIL=0

rm -f "$COOKIE_JAR" "$ADMIN_JAR"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name expected=$expected got=$actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "== Functional smoke tests @ $BASE =="

# 1–3. Public pages
check "GET /" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /admin/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "GET /m" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"

# 4. User login
check "POST /api/auth/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}' \
  -c "$COOKIE_JAR")"

# 5. Bid without auth → 401
check "POST bid no auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/test/bid" \
  -H 'Content-Type: application/json' -d '{"amount":8000}')"

# 6. Admin login
check "POST admin login" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}' \
  -c "$ADMIN_JAR")"

# 7. Admin dashboard
check "GET /admin" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin" -b "$ADMIN_JAR")"

# 8. Assets API rejects JSON body
check "POST /api/admin/assets json" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/assets" \
  -H 'Content-Type: application/json' -d '{}' -b "$ADMIN_JAR")"

# 9. Dev third-party token
check "GET third-party-token" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test1")"

# 10. Third-party SSO login
TOKEN="$(curl -s "$BASE/api/dev/third-party-token?u_id=test1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch{console.log('')}})")"
if [ -n "$TOKEN" ]; then
  check "POST third-party auth" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/third-party" \
    -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\"}" -c /tmp/sishi-sso-cookies.txt)"
else
  echo "FAIL: third-party token empty"
  FAIL=$((FAIL + 1))
fi

# 11. Auction bid (needs LIVE demo project)
read -r AUCTION_ID MIN_BID <<< "$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const { Decimal } = await import('@prisma/client/runtime/library');
  const p = new PrismaClient();
  const project = await p.auctionProject.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!project) { console.log(''); await p.\$disconnect(); return; }
  const top = await p.auctionBid.findFirst({ where: { projectId: project.id }, orderBy: { amount: 'desc' } });
  const min = top
    ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
    : new Decimal(project.startPrice.toString());
  console.log(project.id, min.toFixed(2));
  await p.\$disconnect();
})();
")"

if [ -z "$AUCTION_ID" ]; then
  echo "FAIL: no auction project in DB"
  FAIL=$((FAIL + 1))
else
  BID_CODE="$(curl -s -o /tmp/bid-resp.json -w '%{http_code}' -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}" -b "$COOKIE_JAR")"
  if [ "$BID_CODE" = "200" ]; then
    echo "PASS: auction bid ($BID_CODE)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: auction bid expected=200 got=$BID_CODE body=$(cat /tmp/bid-resp.json)"
    FAIL=$((FAIL + 1))
  fi
fi

# 12. Drying reservation
LISTING_ID="$(cd "$(dirname "$0")/.." && npx tsx -e "
(async () => {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const l = await p.dryingFieldListing.findFirst();
  console.log(l?.id ?? '');
  await p.\$disconnect();
})();
")"
START="$(date -u -d '+3 days' +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)"
END="$(date -u -d '+4 days' +%Y-%m-%d 2>/dev/null || date -u -v+4d +%Y-%m-%d)"
RESERVE_CODE="$(curl -s -o /tmp/reserve-resp.json -w '%{http_code}' -X POST "$BASE/api/m/drying/reserve" \
  -H 'Content-Type: application/json' \
  -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}" \
  -b "$COOKIE_JAR")"
if [ "$RESERVE_CODE" = "200" ]; then
  echo "PASS: drying reserve ($RESERVE_CODE)"
  PASS=$((PASS + 1))
else
  echo "FAIL: drying reserve expected=200 got=$RESERVE_CODE body=$(cat /tmp/reserve-resp.json)"
  FAIL=$((FAIL + 1))
fi

echo "== Results: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
