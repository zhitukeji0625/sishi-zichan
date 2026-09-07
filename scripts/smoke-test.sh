#!/usr/bin/env bash
# API smoke tests — run against `npm run dev` (not production build).
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$ADMIN_JAR" "$USER_JAR"' EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (expected $expected, got $actual) $body"
    FAIL=$((FAIL + 1))
  fi
}

assert_json() {
  local name="$1" body="$2" pattern="$3"
  if echo "$body" | grep -q "$pattern"; then
    echo "  PASS $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (body: $body)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests @ $BASE ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "homepage" "200" "$code"

# 2. Admin login
body=$(curl -s -c "$ADMIN_JAR" -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$body" | tail -1)
json=$(echo "$body" | head -n -1)
assert_status "admin login" "200" "$code"
assert_json "admin login body" "$json" '"ok":true'

# 3. User login
body=$(curl -s -c "$USER_JAR" -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$body" | tail -1)
assert_status "user login" "200" "$code"

# 4. Third-party token (dev only)
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token")
assert_status "third-party token" "200" "$code"

# 5. Upload without multipart → 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H 'Content-Type: application/json' -d '{}')
assert_status "upload non-multipart" "400" "$code"

# 6. Assets without multipart → 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H 'Content-Type: application/json' -d '{}')
assert_status "assets non-multipart" "400" "$code"

# 7. Duplicate register → 409
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')
assert_status "duplicate register" "409" "$code"

# 8. Admin page without login → 307
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
assert_status "admin redirect" "307" "$code"

# 9. Trigger demo auction refresh via page load
curl -s -o /dev/null "$BASE/m/auction"

# 10. Bid on live demo project
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const p=new PrismaClient();
  const x=await p.auctionProject.findFirst({where:{status:'LIVE'}});
  console.log(x?.id??'');
  await p.\$disconnect();
})();
" 2>/dev/null)
if [[ -z "$PROJECT_ID" ]]; then
  echo "  FAIL no LIVE project found"
  FAIL=$((FAIL + 1))
else
  START=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const {Decimal}=await import('@prisma/client/runtime/library');
  const p=new PrismaClient();
  const proj=await p.auctionProject.findFirst({where:{status:'LIVE'}});
  if(!proj){console.log('8000');await p.\$disconnect();return;}
  const top=await p.auctionBid.findFirst({where:{projectId:proj.id},orderBy:{amount:'desc'}});
  const min=top
    ? new Decimal(top.amount.toString()).plus(proj.bidStep.toString())
    : new Decimal(proj.startPrice.toString());
  console.log(min.toFixed(2));
  await p.\$disconnect();
})();
" 2>/dev/null)
  body=$(curl -s -b "$USER_JAR" -w "\n%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' -d "{\"amount\":$START}")
  code=$(echo "$body" | tail -1)
  assert_status "bid on live project" "200" "$code"
fi

# 11. Drying reserve
DRYING_ID=$(cd "$(dirname "$0")/.." && npx tsx -e "
(async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const p=new PrismaClient();
  const x=await p.dryingFieldListing.findFirst();
  console.log(x?.id??'');
  await p.\$disconnect();
})();
" 2>/dev/null)
if [[ -n "$DRYING_ID" ]]; then
  body=$(curl -s -b "$USER_JAR" -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$DRYING_ID\",\"startDate\":\"2026-09-15\",\"endDate\":\"2026-09-17\"}")
  code=$(echo "$body" | tail -1)
  assert_status "drying reserve" "200" "$code"
else
  echo "  FAIL no drying listing"
  FAIL=$((FAIL + 1))
fi

# 12. Unauthenticated bid → 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/${PROJECT_ID:-x}/bid" \
  -H 'Content-Type: application/json' -d '{"amount":8000}')
assert_status "bid unauthenticated" "401" "$code"

# 13. Third-party SSO
TOKEN=$(curl -s "$BASE/api/dev/third-party-token" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [[ -n "$TOKEN" ]]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/third-party" \
    -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\"}")
  assert_status "third-party login" "200" "$code"
fi

# 14. Mobile pages render
for path in /m /m/auction /m/drying /m/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "page $path" "200" "$code"
done

# 15. Favicon
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/favicon.svg")
assert_status "favicon" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
