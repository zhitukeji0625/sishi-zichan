#!/usr/bin/env bash
# API smoke tests — must run against `npm run dev` (not production build)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)

cleanup() { rm -f "$COOKIE_JAR" "$ADMIN_JAR" "$USER_JAR"; }
trap cleanup EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name — $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests @ $BASE ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "GET /" "200" "$code"

# 2. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "GET /admin/login" "200" "$code"

# 3. Mobile home
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
assert_status "GET /m" "200" "$code"

# 4. Admin login API
body=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
assert_json_ok "POST /api/auth/admin/login" "$body"

# 5. Admin dashboard (with cookie)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
assert_status "GET /admin (authenticated)" "200" "$code"

# 6. User login
body=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_json_ok "POST /api/auth/login" "$body"

# 7. User register (unique phone)
PHONE="199$(date +%s | tail -c 9)"
body=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
assert_json_ok "POST /api/auth/register" "$body"

# 8. Upload without auth → 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
assert_status "POST /api/upload (no auth)" "401" "$code"

# 9. Upload without multipart → 400 (not 500)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
assert_status "POST /api/upload (no multipart)" "400" "$code"

# 10. Admin assets without multipart → 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
assert_status "POST /api/admin/assets (no multipart)" "400" "$code"

# 11. Bid without auth → 401
PROJECT_ID=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.auctionProject.findFirst({where:{status:'LIVE'},select:{id:true}}).then(r=>{console.log(r?.id||'');p.\$disconnect()});
" 2>/dev/null)
if [ -n "$PROJECT_ID" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":99999}')
  assert_status "POST bid (no auth)" "401" "$code"

  # 12. Bid with auth — compute min amount
  MIN_BID=$(node -e "
  const {PrismaClient}=require('@prisma/client');
  const p=new PrismaClient();
  (async()=>{
    const proj=await p.auctionProject.findUnique({where:{id:'$PROJECT_ID'},include:{bids:{orderBy:{amount:'desc'},take:1}}});
    const top=proj?.bids[0]?.amount ? Number(proj.bids[0].amount) : Number(proj.startPrice);
    const step=Number(proj.bidStep);
    console.log(top+step);
    await p.\$disconnect();
  })();
  " 2>/dev/null)
  body=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  assert_json_ok "POST bid (valid amount=$MIN_BID)" "$body"
else
  echo "  ⚠ No LIVE auction project — skipping bid tests"
fi

# 13. Drying reserve
LISTING_ID=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.dryingFieldListing.findFirst({where:{status:'OPERATING'},select:{id:true}}).then(r=>{console.log(r?.id||'');p.\$disconnect()});
" 2>/dev/null)
if [ -n "$LISTING_ID" ]; then
  START=$(date -u -d "+3 days" +%Y-%m-%d)
  END=$(date -u -d "+5 days" +%Y-%m-%d)
  body=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  assert_json_ok "POST /api/m/drying/reserve" "$body"
else
  echo "  ⚠ No drying listing — skipping reserve test"
fi

# 14. Drying reserve invalid params → 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -d '{}')
assert_status "POST drying/reserve (invalid)" "400" "$code"

# 15. Mock payment without auth → 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/payments/mock" \
  -H "Content-Type: application/json" -d '{"type":"AUCTION_DEPOSIT","refId":"x"}')
assert_status "POST payments/mock (no auth)" "401" "$code"

# 16. User logout
body=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/auth/logout")
assert_json_ok "POST /api/auth/logout" "$body"

# 17. Admin logout
body=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
assert_json_ok "POST /api/auth/admin/logout" "$body"

# 18. Dev third-party token
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=testuser")
assert_status "GET /api/dev/third-party-token" "200" "$code"

# 19. Third-party SSO login
TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_sso_user" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch{console.log('')}})")
if [ -n "$TOKEN" ]; then
  body=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  assert_json_ok "POST /api/auth/third-party" "$body"
else
  echo "  ✗ third-party token generation failed"
  FAIL=$((FAIL + 1))
fi

# 20. Mobile auction page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")
assert_status "GET /m/auction" "200" "$code"

# 21. Mobile drying page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying")
assert_status "GET /m/drying" "200" "$code"

# 22. Admin assets page (re-login)
curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' > /dev/null
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/assets")
assert_status "GET /admin/assets" "200" "$code"

# 23. Admin dict page
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/dict")
assert_status "GET /admin/dict" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
