#!/usr/bin/env bash
# API 冒烟测试 — 须在 dev 模式 (npm run dev) 下运行
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

pass() { echo "✓ $1"; PASS=$((PASS+1)); }
fail() { echo "✗ $1: $2"; FAIL=$((FAIL+1)); }

check_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name ($actual)"; else fail "$name" "expected $expected got $actual"; fi
}

# 1. Portal homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check_status "Portal /" "200" "$code"

# 2. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check_status "Admin login page" "200" "$code"

# 3. Mobile home
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
check_status "Mobile home" "200" "$code"

# 4. Admin login API
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
if [ "$code" = "200" ] && echo "$body" | grep -q '"ok"'; then pass "Admin login API ($code)"; else fail "Admin login API" "code=$code body=$body"; fi

# 5. User login API
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
if [ "$code" = "200" ] && echo "$body" | grep -q '"ok"'; then pass "User login API ($code)"; else fail "User login API" "code=$code body=$body"; fi

# 6. User register API
PHONE="199$(date +%s | tail -c 10)"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
if [ "$code" = "200" ] && echo "$body" | grep -q '"ok"'; then pass "User register API ($code)"; else fail "User register API" "code=$code body=$body"; fi

# 7. Third-party token (dev)
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
if [ "$code" = "200" ] && echo "$body" | grep -q 'token'; then pass "Dev third-party token ($code)"; else fail "Dev third-party token" "code=$code body=$body"; fi

# 8. Upload without auth -> 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')
check_status "Upload without auth" "401" "$code"

# 9. Upload non-multipart with admin auth -> 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')
if [ "$code" = "400" ]; then pass "Upload non-multipart ($code)"; else fail "Upload non-multipart" "expected 400 got $code"; fi

# 10. Admin assets without auth -> 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{}')
check_status "Admin assets without auth" "401" "$code"

# 11. Admin assets non-multipart with auth -> 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{}')
if [ "$code" = "400" ]; then pass "Admin assets non-multipart ($code)"; else fail "Admin assets non-multipart" "expected 400 got $code"; fi

# 12. Bid without auth -> 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" -H "Content-Type: application/json" -d '{"amount":100}')
check_status "Bid without auth" "401" "$code"

# Query DB for LIVE project and drying listing
DB_OUT=$(cd "$(dirname "$0")/.." && npx tsx scripts/db-query.ts 2>/dev/null)
PROJECT_ID=$(echo "$DB_OUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).projectId||'')}catch{console.log('')}})")
LISTING_ID=$(echo "$DB_OUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).listingId||'')}catch{console.log('')}})")
START_PRICE=$(echo "$DB_OUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).startPrice||'100')}catch{console.log('100')}})")
BID_STEP=$(echo "$DB_OUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).bidStep||'10')}catch{console.log('10')}})")

if [ -n "$PROJECT_ID" ]; then
  # 13. Auction detail page
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction/$PROJECT_ID")
  check_status "Auction detail page" "200" "$code"

  # 14. Place bid
  BID_AMT=$(node -e "const sp=parseFloat('$START_PRICE');const bs=parseFloat('$BID_STEP');console.log(sp+bs*2)")
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$BID_AMT}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  if [ "$code" = "200" ] && echo "$body" | grep -q '"ok"'; then pass "Place bid ($code amount=$BID_AMT)"; else fail "Place bid" "code=$code body=$body"; fi
else
  fail "DB LIVE project" "not found — run npm run db:seed to refresh demo auction"
fi

if [ -n "$LISTING_ID" ]; then
  # 15. Drying detail page
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying/$LISTING_ID")
  check_status "Drying detail page" "200" "$code"

  # 16. Drying reserve
  START_DATE=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
  END_DATE=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  if [ "$code" = "200" ] && echo "$body" | grep -q '"ok"'; then pass "Drying reserve ($code)"; else fail "Drying reserve" "code=$code body=$body"; fi
else
  fail "DB drying listing" "not found"
fi

# 17. Admin dashboard (with auth)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
check_status "Admin dashboard" "200" "$code"

# 18. Auction list page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")
check_status "Auction list page" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
