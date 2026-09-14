#!/usr/bin/env bash
# API smoke tests — requires dev server on localhost:3000
set -euo pipefail
BASE="http://localhost:3000"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS: $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name — expected HTTP $expected, got $actual"
    [[ -n "$body" ]] && echo "        body: $body"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name — body: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke Test: $BASE ==="

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
(cd "$ROOT" && npm run db:seed 2>&1) | grep -E 'Refreshed|Seed skipped' || true

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "GET /" 200 "$code"

# 2. Mobile pages
for path in /m /m/login /m/auction /m/drying /admin/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" 200 "$code"
done

# 3. Admin login — wrong password
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"wrong"}')
code=$(echo "$body" | tail -1)
assert_status "POST /api/auth/admin/login (bad pwd)" 401 "$code"

# 4. Admin login — success
body=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
resp=$(echo "$body" | sed '$d')
code=$(echo "$body" | tail -1)
assert_status "POST /api/auth/admin/login" 200 "$code" "$resp"
assert_json_ok "admin login ok" "$resp"

# 5. User login
body=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
resp=$(echo "$body" | sed '$d')
code=$(echo "$body" | tail -1)
assert_status "POST /api/auth/login" 200 "$code" "$resp"
assert_json_ok "user login ok" "$resp"

# 6. User register (dynamic phone)
REG_PHONE="199$(date +%s | tail -c 9)"
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$REG_PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
resp=$(echo "$body" | sed '$d')
code=$(echo "$body" | tail -1)
assert_status "POST /api/auth/register" 200 "$code" "$resp"
assert_json_ok "user register ok" "$resp"

# 7. Bid without login
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/fake-id/bid" \
  -H "Content-Type: application/json" -d '{"amount":1000}')
code=$(echo "$body" | tail -1)
assert_status "POST bid (no auth)" 401 "$code"

# 8. Get LIVE project from DB and place bid
PROJECT_ID=$(cd /workspace && npx tsx -e "
(async()=>{
const {PrismaClient}=await import('@prisma/client');
const p=new PrismaClient();
const proj=await p.auctionProject.findFirst({where:{status:'LIVE'},orderBy:{createdAt:'desc'}});
if(!proj){console.log('');process.exit(0);}
const top=await p.auctionBid.findFirst({where:{projectId:proj.id},orderBy:{amount:'desc'}});
const min=top?Number(top.amount)+Number(proj.bidStep):Number(proj.startPrice);
console.log(proj.id+' '+min);
await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [[ -n "$PROJECT_ID" && "$PROJECT_ID" != *"NO_LIVE"* ]]; then
  PID=$(echo "$PROJECT_ID" | awk '{print $1}')
  MIN=$(echo "$PROJECT_ID" | awk '{print $2}')
  body=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN}")
  resp=$(echo "$body" | sed '$d')
  code=$(echo "$body" | tail -1)
  assert_status "POST bid on LIVE project" 200 "$code" "$resp"
  assert_json_ok "bid ok" "$resp"
else
  echo "  SKIP: no LIVE auction project"
fi

# 9. Drying reserve
LISTING_ID=$(cd /workspace && npx tsx -e "
(async()=>{
const {PrismaClient}=await import('@prisma/client');
const p=new PrismaClient();
const l=await p.dryingFieldListing.findFirst({where:{status:'OPERATING'}});
console.log(l?.id||'');
await p.\$disconnect();
})();
" 2>/dev/null | tail -1)

if [[ -n "$LISTING_ID" ]]; then
  START=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  body=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  resp=$(echo "$body" | sed '$d')
  code=$(echo "$body" | tail -1)
  assert_status "POST drying reserve" 200 "$code" "$resp"
  assert_json_ok "drying reserve ok" "$resp"
else
  echo "  SKIP: no OPERATING drying listing"
fi

# 10. Upload without multipart (admin)
body=$(curl -s -w "\n%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"file":"fake"}')
code=$(echo "$body" | tail -1)
# Should be 400 not 500
if [[ "$code" == "400" || "$code" == "401" ]]; then
  echo "  PASS: POST /api/upload non-multipart returns $code (not 500)"
  PASS=$((PASS + 1))
else
  echo "  FAIL: POST /api/upload non-multipart — expected 400, got $code"
  FAIL=$((FAIL + 1))
fi

# 11. Admin assets without multipart
body=$(curl -s -w "\n%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"test"}')
code=$(echo "$body" | tail -1)
if [[ "$code" == "400" || "$code" == "401" ]]; then
  echo "  PASS: POST /api/admin/assets non-multipart returns $code (not 500)"
  PASS=$((PASS + 1))
else
  echo "  FAIL: POST /api/admin/assets non-multipart — expected 400, got $code"
  FAIL=$((FAIL + 1))
fi

# 12. Third-party token (dev)
body=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke-test")
resp=$(echo "$body" | sed '$d')
code=$(echo "$body" | tail -1)
assert_status "GET /api/dev/third-party-token" 200 "$code" "$resp"

# 13. Unauthenticated admin assets GET (should redirect or 401 via middleware for pages, API returns 401)
body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: multipart/form-data" -F "name=test")
code=$(echo "$body" | tail -1)
assert_status "POST /api/admin/assets (no auth)" 401 "$code"

# 14. Logout
body=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
code=$(echo "$body" | tail -1)
assert_status "POST /api/auth/logout" 200 "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
