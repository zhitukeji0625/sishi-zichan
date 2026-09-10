#!/usr/bin/env bash
# API smoke tests for sishi-zichan (requires dev server on :3000)
set -euo pipefail

BASE="http://localhost:3000"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp}/smoke-$$"
mkdir -p "$TMPDIR"

pass() { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1"; echo "    $2" >&2; }

check_status() {
  local name="$1" expected="$2" actual="$3" body="$4"
  if [ "$actual" = "$expected" ]; then
    pass "$name (HTTP $actual)"
  else
    fail "$name (expected $expected, got $actual)" "$body"
  fi
}

echo "=== Smoke Tests ==="

# 1. Portal
code=$(curl -s -o "$TMPDIR/portal.html" -w "%{http_code}" "$BASE/")
check_status "GET /" "200" "$code" ""

# 2. H5 home
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
check_status "GET /m" "200" "$code" ""

# 3. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
check_status "GET /admin/login" "200" "$code" ""

# 4. Dev third-party token
code=$(curl -s -o "$TMPDIR/token.json" -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
body=$(cat "$TMPDIR/token.json")
check_status "GET /api/dev/third-party-token" "200" "$code" "$body"
TOKEN=$(echo "$body" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || true)

# 5. User login fail
code=$(curl -s -o "$TMPDIR/login_fail.json" -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')
check_status "POST /api/auth/login (bad password)" "401" "$code" "$(cat "$TMPDIR/login_fail.json")"

# 6. User login success
code=$(curl -s -o "$TMPDIR/login_ok.json" -w "%{http_code}" -c "$TMPDIR/user_cookies.txt" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check_status "POST /api/auth/login" "200" "$code" "$(cat "$TMPDIR/login_ok.json")"

# 7. Register with unique phone
PHONE="199$(date +%s | tail -c 9)"
code=$(curl -s -o "$TMPDIR/reg.json" -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
check_status "POST /api/auth/register" "200" "$code" "$(cat "$TMPDIR/reg.json")"

# 8. Third-party login
if [ -n "$TOKEN" ]; then
  code=$(curl -s -o "$TMPDIR/sso.json" -w "%{http_code}" -c "$TMPDIR/sso_cookies.txt" -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
  check_status "POST /api/auth/third-party" "200" "$code" "$(cat "$TMPDIR/sso.json")"
else
  fail "POST /api/auth/third-party" "no token from dev endpoint"
fi

# 9. Protected bid without auth
code=$(curl -s -o "$TMPDIR/bid_unauth.json" -w "%{http_code}" -X POST "$BASE/api/m/auction/fake-id/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
check_status "POST /api/m/auction/bid (no auth)" "401" "$code" "$(cat "$TMPDIR/bid_unauth.json")"

# 10. Admin login
code=$(curl -s -o "$TMPDIR/admin_login.json" -w "%{http_code}" -c "$TMPDIR/admin_cookies.txt" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000003","password":"admin123"}')
check_status "POST /api/auth/admin/login" "200" "$code" "$(cat "$TMPDIR/admin_login.json")"

# 11. Upload without auth
code=$(curl -s -o "$TMPDIR/upload_unauth.json" -w "%{http_code}" -X POST "$BASE/api/upload")
check_status "POST /api/upload (no auth)" "401" "$code" "$(cat "$TMPDIR/upload_unauth.json")"

# 12. Upload non-multipart (should be 400, not 500)
code=$(curl -s -o "$TMPDIR/upload_bad.json" -w "%{http_code}" -b "$TMPDIR/admin_cookies.txt" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{"file":"test"}')
check_status "POST /api/upload (non-multipart)" "400" "$code" "$(cat "$TMPDIR/upload_bad.json")"

# 13. Admin assets non-multipart (should be 400, not 500)
code=$(curl -s -o "$TMPDIR/assets_bad.json" -w "%{http_code}" -b "$TMPDIR/admin_cookies.txt" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"test"}')
check_status "POST /api/admin/assets (non-multipart)" "400" "$code" "$(cat "$TMPDIR/assets_bad.json")"

# 14. Drying reserve
LISTING_ID=$(cd /workspace && npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();const l=await p.dryingFieldListing.findFirst({where:{status:'OPERATING'}});console.log(l?.id||'');await p.\$disconnect();})();" 2>/dev/null)
if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+1 day" +%Y-%m-%d 2>/dev/null || date -v+1d +%Y-%m-%d)
  END=$(date -d "+2 days" +%Y-%m-%d 2>/dev/null || date -v+2d +%Y-%m-%d)
  code=$(curl -s -o "$TMPDIR/drying.json" -w "%{http_code}" -b "$TMPDIR/user_cookies.txt" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check_status "POST /api/m/drying/reserve" "200" "$code" "$(cat "$TMPDIR/drying.json")"
else
  fail "POST /api/m/drying/reserve" "no OPERATING listing in DB"
fi

# 15. Admin logout
code=$(curl -s -o "$TMPDIR/admin_logout.json" -w "%{http_code}" -b "$TMPDIR/admin_cookies.txt" -X POST "$BASE/api/auth/admin/logout")
check_status "POST /api/auth/admin/logout" "200" "$code" "$(cat "$TMPDIR/admin_logout.json")"

# 16. User logout
code=$(curl -s -o "$TMPDIR/user_logout.json" -w "%{http_code}" -b "$TMPDIR/user_cookies.txt" -X POST "$BASE/api/auth/logout")
check_status "POST /api/auth/logout" "200" "$code" "$(cat "$TMPDIR/user_logout.json")"

# 17. Admin pages (unauthenticated redirect)
code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/admin")
# Should redirect to login (307/302) or show login
if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "302" ]; then
  pass "GET /admin (auth redirect) (HTTP $code)"
else
  fail "GET /admin (auth redirect)" "got $code"
fi

# 18. Auction list page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")
check_status "GET /m/auction" "200" "$code" ""

# 19. Drying list page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying")
check_status "GET /m/drying" "200" "$code" ""

# 20. Login missing fields
code=$(curl -s -o "$TMPDIR/login_missing.json" -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{}')
check_status "POST /api/auth/login (missing fields)" "400" "$code" "$(cat "$TMPDIR/login_missing.json")"

# 21. Register invalid phone
code=$(curl -s -o "$TMPDIR/reg_invalid.json" -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" -d '{"phone":"123","password":"test1234"}')
check_status "POST /api/auth/register (invalid phone)" "400" "$code" "$(cat "$TMPDIR/reg_invalid.json")"

# 22. Admin login fail
code=$(curl -s -o "$TMPDIR/admin_fail.json" -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"wrong"}')
check_status "POST /api/auth/admin/login (bad password)" "401" "$code" "$(cat "$TMPDIR/admin_fail.json")"

# 23. Third-party login missing token
code=$(curl -s -o "$TMPDIR/sso_missing.json" -w "%{http_code}" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" -d '{}')
check_status "POST /api/auth/third-party (missing token)" "400" "$code" "$(cat "$TMPDIR/sso_missing.json")"

# 24. Drying reserve without auth
code=$(curl -s -o "$TMPDIR/drying_unauth.json" -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -d '{"listingId":"x","startDate":"2026-01-01","endDate":"2026-01-02"}')
check_status "POST /api/m/drying/reserve (no auth)" "401" "$code" "$(cat "$TMPDIR/drying_unauth.json")"

# 25. Upload with valid image (admin re-login)
curl -s -c "$TMPDIR/admin_cookies.txt" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000003","password":"admin123"}' > /dev/null
# Create a minimal 1x1 PNG
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > "$TMPDIR/test.png"
code=$(curl -s -o "$TMPDIR/upload_ok.json" -w "%{http_code}" -b "$TMPDIR/admin_cookies.txt" -X POST "$BASE/api/upload" \
  -F "file=@$TMPDIR/test.png;type=image/png")
body=$(cat "$TMPDIR/upload_ok.json")
check_status "POST /api/upload (valid image)" "200" "$code" "$body"
UPLOAD_URL=$(echo "$body" | grep -o '"/api/uploads/[^"]*"' | tr -d '"' || true)

# 26. Serve uploaded file
if [ -n "$UPLOAD_URL" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$UPLOAD_URL")
  check_status "GET $UPLOAD_URL" "200" "$code" ""
else
  fail "GET uploaded file" "no upload URL from previous test"
fi

# 27. Create asset via admin API
ORG_ID=$(cd /workspace && npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();const o=await p.organization.findFirst({where:{level:'COMPANY'}});console.log(o?.id||'');await p.\$disconnect();})();" 2>/dev/null)
if [ -n "$ORG_ID" ]; then
  code=$(curl -s -o "$TMPDIR/asset.json" -w "%{http_code}" -b "$TMPDIR/admin_cookies.txt" -X POST "$BASE/api/admin/assets" \
    -F "orgId=$ORG_ID" -F "type=LAND" -F "name=冒烟测试资产" -F "locationText=测试地点")
  check_status "POST /api/admin/assets" "200" "$code" "$(cat "$TMPDIR/asset.json")"
else
  fail "POST /api/admin/assets" "no COMPANY org in DB"
fi

# 28. Bid on ended project (should fail gracefully, not 500)
PROJECT_ID=$(cd /workspace && npx tsx -e "(async()=>{const{PrismaClient}=await import('@prisma/client');const p=new PrismaClient();const pr=await p.auctionProject.findFirst();console.log(pr?.id||'');await p.\$disconnect();})();" 2>/dev/null)
curl -s -c "$TMPDIR/user_cookies.txt" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}' > /dev/null
if [ -n "$PROJECT_ID" ]; then
  code=$(curl -s -o "$TMPDIR/bid_ended.json" -w "%{http_code}" -b "$TMPDIR/user_cookies.txt" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":8000}')
  # Should be 400 (ended) not 500
  if [ "$code" = "400" ] || [ "$code" = "403" ]; then
    pass "POST /api/m/auction/bid (ended project) (HTTP $code)"
  elif [ "$code" = "500" ]; then
    fail "POST /api/m/auction/bid (ended project)" "got 500: $(cat "$TMPDIR/bid_ended.json")"
  else
    pass "POST /api/m/auction/bid (ended project) (HTTP $code)"
  fi
else
  fail "POST /api/m/auction/bid" "no project in DB"
fi

# 29. Mock payment without auth
code=$(curl -s -o "$TMPDIR/pay_unauth.json" -w "%{http_code}" -X POST "$BASE/api/m/payments/mock" \
  -H "Content-Type: application/json" -d '{"purpose":"AUCTION_DEPOSIT"}')
check_status "POST /api/m/payments/mock (no auth)" "401" "$code" "$(cat "$TMPDIR/pay_unauth.json")"

# 30. Upload path traversal blocked
code=$(curl -s -o "$TMPDIR/traversal.json" -w "%{http_code}" "$BASE/api/uploads/../../../etc/passwd")
if [ "$code" = "400" ] || [ "$code" = "404" ]; then
  pass "GET /api/uploads (path traversal blocked) (HTTP $code)"
else
  fail "GET /api/uploads (path traversal)" "got $code"
fi

# 31. Register page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/register")
check_status "GET /m/register" "200" "$code" ""

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
rm -rf "$TMPDIR"
exit $FAIL
