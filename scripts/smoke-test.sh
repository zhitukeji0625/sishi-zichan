#!/usr/bin/env bash
# HTTP smoke tests — run against a dev server (npm run dev)
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
USER_COOKIE="/tmp/smoke_user.txt"
ADMIN_COOKIE="/tmp/smoke_admin.txt"
rm -f "$USER_COOKIE" "$ADMIN_COOKIE"

check() {
  local name="$1" expect="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expect" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expect, got $actual) $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test: $BASE ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "GET /" "200" "$code"

# 2. Mobile home
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
check "GET /m" "200" "$code"

# 3. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check "GET /admin/login" "200" "$code"

# 4. Admin login API
resp=$(curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$resp" | grep -q '"ok":true' && check "POST /api/auth/admin/login" "ok" "ok" || check "POST /api/auth/admin/login" "ok" "fail" "$resp"

# 5. Admin dashboard
code=$(curl -s -b "$ADMIN_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/admin")
check "GET /admin (auth)" "200" "$code"

# 6. User login API
resp=$(curl -s -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$resp" | grep -q '"ok":true' && check "POST /api/auth/login" "ok" "ok" || check "POST /api/auth/login" "ok" "fail" "$resp"

# 7. User me page
code=$(curl -s -b "$USER_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/m/me")
check "GET /m/me (auth)" "200" "$code"

# 8. Upload without multipart → 400
code=$(curl -s -b "$ADMIN_COOKIE" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"test":1}')
check "POST /api/upload (non-multipart)" "400" "$code"

# 9. Admin asset create without multipart → 400
code=$(curl -s -b "$ADMIN_COOKIE" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"test"}')
check "POST /api/admin/assets (non-multipart)" "400" "$code"

# 10. Dev third-party token
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke")
check "GET /api/dev/third-party-token" "200" "$code"

# 11. Drying reservation
LISTING_ID=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.dryingFieldListing.findFirst({where:{status:'OPERATING'}}).then(l=>{console.log(l?.id||'');p.\$disconnect()});
" 2>/dev/null || echo "")
if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+4 days" +%Y-%m-%d)
  END=$(date -d "+5 days" +%Y-%m-%d)
  resp=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  echo "$resp" | grep -q '"ok":true' && check "POST /api/m/drying/reserve" "ok" "ok" || check "POST /api/m/drying/reserve" "ok" "fail" "$resp"
else
  echo "⊘ POST /api/m/drying/reserve (no listing, skipped)"
fi

# 12. Demo auction refresh + bid
PROJECT_ID=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const u=await p.endUser.findUnique({where:{phone:'13800138000'}});
  const reg=await p.auctionRegistration.findFirst({where:{endUserId:u?.id,depositPaid:true},include:{project:true}});
  console.log(reg?.project?.id||'');
  await p.\$disconnect();
})();
" 2>/dev/null || echo "")
if [ -n "$PROJECT_ID" ]; then
  # Trigger layout refresh
  curl -s -o /dev/null "$BASE/m/auction"
  STATUS=$(node -e "
  const {PrismaClient}=require('@prisma/client');
  const p=new PrismaClient();
  p.auctionProject.findUnique({where:{id:'$PROJECT_ID'}}).then(pj=>{console.log(pj?.status||'');p.\$disconnect()});
  " 2>/dev/null || echo "")
  if [ "$STATUS" = "LIVE" ]; then
    MIN=$(node -e "
    const {PrismaClient}=require('@prisma/client');
    const p=new PrismaClient();
    (async()=>{
      const pj=await p.auctionProject.findUnique({where:{id:'$PROJECT_ID'}});
      const top=await p.auctionBid.findFirst({where:{projectId:'$PROJECT_ID'},orderBy:{amount:'desc'}});
      const min=top?Number(top.amount)+Number(pj.bidStep):Number(pj.startPrice);
      console.log(min);
      await p.\$disconnect();
    })();
    " 2>/dev/null || echo "8000")
    resp=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
      -H "Content-Type: application/json" -d "{\"amount\":$MIN}")
    echo "$resp" | grep -q '"ok":true' && check "POST /api/m/auction/bid" "ok" "ok" || check "POST /api/m/auction/bid" "ok" "fail" "$resp"
  else
    echo "⊘ POST /api/m/auction/bid (status=$STATUS, skipped)"
  fi
else
  echo "⊘ POST /api/m/auction/bid (no project, skipped)"
fi

# 13. Mock payment invalid params → 400
code=$(curl -s -b "$USER_COOKIE" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/payments/mock" \
  -H "Content-Type: application/json" -d '{"purpose":"INVALID"}')
check "POST /api/m/payments/mock (bad purpose)" "400" "$code"

# 14. Register new user
PHONE=$(node -e "console.log('199' + String(Date.now()).slice(-8))")
resp=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
echo "$resp" | grep -q '"ok":true' && check "POST /api/auth/register" "ok" "ok" || check "POST /api/auth/register" "ok" "fail" "$resp"

# 15. Auction list page
code=$(curl -s -b "$USER_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/m/auction")
check "GET /m/auction (auth)" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
