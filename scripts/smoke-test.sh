#!/usr/bin/env bash
# API smoke tests — requires dev server on localhost:3000 and seeded DB
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp/smoke-$$}"
mkdir -p "$TMPDIR"

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name (HTTP $actual)"; else fail "$name (expected $expected, got $actual)"; fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then pass "$name"; else fail "$name — $body"; fi
}

echo "=== Smoke tests @ $BASE ==="

# 1. Public pages
for path in "/" "/m" "/m/login" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

# 2. Dev third-party token
code=$(curl -s -o "$TMPDIR/tp.json" -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
assert_status "GET /api/dev/third-party-token" "200" "$code"
TOKEN=$(python3 -c "import json; print(json.load(open('$TMPDIR/tp.json'))['token'])" 2>/dev/null || echo "")
[ -n "$TOKEN" ] && pass "third-party token generated" || fail "third-party token missing"

# 3. User register (unique phone)
PHONE="199$(date +%s | tail -c 9)"
code=$(curl -s -c "$TMPDIR/user.txt" -o "$TMPDIR/reg.json" -w "%{http_code}" \
  -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟用户\"}")
assert_status "POST /api/auth/register" "200" "$code"
assert_json_ok "register response" "$(cat "$TMPDIR/reg.json")"

# 4. User login
code=$(curl -s -c "$TMPDIR/user2.txt" -o "$TMPDIR/login.json" -w "%{http_code}" \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_status "POST /api/auth/login" "200" "$code"
assert_json_ok "login response" "$(cat "$TMPDIR/login.json")"

# 5. Demo user login cookie
code=$(curl -s -c "$TMPDIR/demo.txt" -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
assert_status "demo user login" "200" "$code"

# 6. Third-party auth
code=$(curl -s -c "$TMPDIR/sso.txt" -o "$TMPDIR/sso.json" -w "%{http_code}" \
  -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
assert_status "POST /api/auth/third-party" "200" "$code"
assert_json_ok "third-party login" "$(cat "$TMPDIR/sso.json")"

# 7. Unauthenticated bid → 401
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/m/auction/fake-id/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":100}')
assert_status "bid without auth → 401" "401" "$code"

# 8. Lookup LIVE project and min bid from DB
eval "$(npx tsx scripts/smoke-helpers.ts 2>/dev/null)" || true
if [ -z "${PROJECT_ID:-}" ]; then
  fail "could not resolve LIVE auction project from DB"
else
  pass "resolved project $PROJECT_ID minBid=$MIN_BID"
  code=$(curl -s -b "$TMPDIR/demo.txt" -o "$TMPDIR/bid.json" -w "%{http_code}" \
    -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  if [ "$code" = "200" ]; then
    assert_json_ok "place bid" "$(cat "$TMPDIR/bid.json")"
  elif [ "$code" = "400" ] && grep -q "竞拍未在进行中" "$TMPDIR/bid.json" 2>/dev/null; then
    fail "auction not LIVE — run seed refresh or fix demo data"
  else
    fail "place bid (HTTP $code) — $(cat "$TMPDIR/bid.json")"
  fi
fi

# 9. Drying reservation
if [ -z "${LISTING_ID:-}" ]; then
  fail "could not resolve drying listing from DB"
else
  START=$(date -d "+10 days" +%Y-%m-%d 2>/dev/null || date -v+10d +%Y-%m-%d)
  END=$(date -d "+11 days" +%Y-%m-%d 2>/dev/null || date -v+11d +%Y-%m-%d)
  code=$(curl -s -b "$TMPDIR/demo.txt" -o "$TMPDIR/dry.json" -w "%{http_code}" \
    -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  assert_status "POST /api/m/drying/reserve" "200" "$code"
  assert_json_ok "drying reserve" "$(cat "$TMPDIR/dry.json")"
fi

# 10. Admin login
code=$(curl -s -c "$TMPDIR/admin.txt" -o "$TMPDIR/admin.json" -w "%{http_code}" \
  -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000002","password":"admin123"}')
assert_status "POST /api/auth/admin/login" "200" "$code"
assert_json_ok "admin login" "$(cat "$TMPDIR/admin.json")"

# 11. Admin asset create (multipart)
if [ -n "${ORG_ID:-}" ]; then
  code=$(curl -s -b "$TMPDIR/admin.txt" -o "$TMPDIR/asset.json" -w "%{http_code}" \
    -X POST "$BASE/api/admin/assets" \
    -F "orgId=$ORG_ID" -F "type=LAND" -F "name=冒烟测试资产" -F "locationText=测试地点")
  assert_status "POST /api/admin/assets" "200" "$code"
  assert_json_ok "create asset" "$(cat "$TMPDIR/asset.json")"
fi

# 12. Non-multipart admin asset → 400 (not 500)
code=$(curl -s -b "$TMPDIR/admin.txt" -o "$TMPDIR/badasset.json" -w "%{http_code}" \
  -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"x","type":"LAND","name":"x","locationText":"x"}')
assert_status "non-multipart asset create → 400" "400" "$code"

# 13. Upload without file → 400
code=$(curl -s -b "$TMPDIR/admin.txt" -o "$TMPDIR/nofile.json" -w "%{http_code}" \
  -X POST "$BASE/api/upload" \
  -F "dummy=1")
assert_status "upload without file → 400" "400" "$code"

# 14. Upload without auth → 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
assert_status "upload without auth → 401" "401" "$code"

# 15. Logout
code=$(curl -s -b "$TMPDIR/demo.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/logout")
assert_status "POST /api/auth/logout" "200" "$code"
code=$(curl -s -b "$TMPDIR/admin.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/logout")
assert_status "POST /api/auth/admin/logout" "200" "$code"

# 16. Invalid login → 401
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
assert_status "wrong password → 401" "401" "$code"

# 17. Register duplicate → 409
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123","name":"dup"}')
assert_status "duplicate register → 409" "409" "$code"

# 18. Mobile protected pages (with session)
code=$(curl -s -b "$TMPDIR/demo.txt" -o /dev/null -w "%{http_code}" "$BASE/m/auction")
assert_status "GET /m/auction (logged in)" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
rm -rf "$TMPDIR"
[ "$FAIL" -eq 0 ]
