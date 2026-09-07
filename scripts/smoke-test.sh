#!/usr/bin/env bash
# API smoke tests — run against `npm run dev` on localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then pass "$name ($actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

echo "=== Smoke tests @ $BASE ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "GET /" "200" "$code"

# 2. Mobile pages
for path in /m /m/auction /m/drying /m/login /m/register; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

# 3. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "GET /admin/login" "200" "$code"

# 4. Admin redirect without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -L --max-redirs 0 "$BASE/admin" 2>/dev/null || true)
# middleware redirects 307
redir=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
assert_status "GET /admin (unauth redirect)" "307" "$redir"

# 5. User login
login_resp=$(curl -s -c "$TMP/user.txt" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$login_resp" | grep -q '"ok"'; then pass "POST /api/auth/login"; else fail "POST /api/auth/login: $login_resp"; fi

# 6. Admin login
admin_resp=$(curl -s -c "$TMP/admin.txt" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}')
if echo "$admin_resp" | grep -q '"ok"'; then pass "POST /api/auth/admin/login"; else fail "POST /api/auth/admin/login: $admin_resp"; fi

# 7. Duplicate register → 409
dup_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123","name":"dup"}')
assert_status "POST /api/auth/register duplicate" "409" "$dup_code"

# 8. Third-party dev token
token_resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=demo_user")
if echo "$token_resp" | grep -q '"token"'; then pass "GET /api/dev/third-party-token"; else fail "GET /api/dev/third-party-token: $token_resp"; fi

# 9. Upload without multipart → should be 400 not 500
upload_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$TMP/admin.txt" -X POST "$BASE/api/upload" \
  -H 'Content-Type: application/json' \
  -d '{"file":"x"}')
if [[ "$upload_code" == "400" || "$upload_code" == "415" ]]; then
  pass "POST /api/upload non-multipart ($upload_code)"
elif [[ "$upload_code" == "500" ]]; then
  fail "POST /api/upload non-multipart (500 — should be 400)"
else
  pass "POST /api/upload non-multipart ($upload_code)"
fi

# 10. Asset create without multipart
asset_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$TMP/admin.txt" -X POST "$BASE/api/admin/assets" \
  -H 'Content-Type: application/json' \
  -d '{"name":"test"}')
if [[ "$asset_code" == "400" || "$asset_code" == "415" ]]; then
  pass "POST /api/admin/assets non-multipart ($asset_code)"
elif [[ "$asset_code" == "500" ]]; then
  fail "POST /api/admin/assets non-multipart (500 — should be 400)"
else
  pass "POST /api/admin/assets non-multipart ($asset_code)"
fi

# 11. Unauthenticated bid → 401
bid_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/clxxxxxxxxxxxxxxxxxxxxxxxxx/bid" \
  -H 'Content-Type: application/json' \
  -d '{"amount":100}')
assert_status "POST /api/m/auction/bid (no auth)" "401" "$bid_code"

# 12. Get LIVE or any auction project for bid test
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx scripts/get-demo-ids.ts 2>/dev/null | grep projectId | cut -d= -f2 || true)
if [[ -z "$PROJECT_ID" ]]; then
  fail "Could not resolve auction project ID"
else
  pass "Resolved projectId=$PROJECT_ID"

  # Ensure project is LIVE for bid test
  cd "$(dirname "$0")/.."
  BID_INFO=$(npx tsx scripts/get-demo-ids.ts --bid-info 2>/dev/null || true)
  MIN_BID=$(echo "$BID_INFO" | grep minBid | cut -d= -f2)
  if [[ -z "$MIN_BID" ]]; then MIN_BID=100; fi

  bid_resp=$(curl -s -w "\n%{http_code}" -b "$TMP/user.txt" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' \
    -d "{\"amount\":$MIN_BID}")
  bid_http=$(echo "$bid_resp" | tail -1)
  bid_body=$(echo "$bid_resp" | head -n -1)
  if [[ "$bid_http" == "200" ]]; then
    pass "POST /api/m/auction/bid ($MIN_BID)"
  elif [[ "$bid_http" == "400" ]]; then
    pass "POST /api/m/auction/bid rejected ($bid_body)"
  else
    fail "POST /api/m/auction/bid (HTTP $bid_http: $bid_body)"
  fi
fi

# 13. Drying reserve
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx scripts/get-demo-ids.ts 2>/dev/null | grep listingId | cut -d= -f2 || true)
if [[ -z "$LISTING_ID" ]]; then
  fail "Could not resolve drying listing ID"
else
  pass "Resolved listingId=$LISTING_ID"
  reserve_resp=$(curl -s -w "\n%{http_code}" -b "$TMP/user.txt" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-09-15\",\"endDate\":\"2026-09-17\"}")
  reserve_http=$(echo "$reserve_resp" | tail -1)
  reserve_body=$(echo "$reserve_resp" | head -n -1)
  if [[ "$reserve_http" == "200" || "$reserve_http" == "201" ]]; then
    pass "POST /api/m/drying/reserve"
  elif [[ "$reserve_http" == "400" || "$reserve_http" == "409" ]]; then
    pass "POST /api/m/drying/reserve ($reserve_body)"
  else
    fail "POST /api/m/drying/reserve (HTTP $reserve_http: $reserve_body)"
  fi
fi

# 14. Mock payment without auth
pay_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/payments/mock" \
  -H 'Content-Type: application/json' \
  -d '{"type":"auction_deposit","projectId":"x","amount":1}')
assert_status "POST /api/m/payments/mock (no auth)" "401" "$pay_code"

# 15. Logout
logout_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$TMP/user.txt" -X POST "$BASE/api/auth/logout")
assert_status "POST /api/auth/logout" "200" "$logout_code"

# 16. Favicon
favicon_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/favicon.svg")
assert_status "GET /favicon.svg" "200" "$favicon_code"

# 17. Admin pages with cookie
for path in /admin /admin/assets /admin/auctions /admin/drying; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$TMP/admin.txt" "$BASE$path")
  assert_status "GET $path (admin)" "200" "$code"
done

# 18. Dict categories (via page load check)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$TMP/admin.txt" "$BASE/admin/dict")
assert_status "GET /admin/dict" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
