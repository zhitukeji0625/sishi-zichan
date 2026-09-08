#!/usr/bin/env bash
# API smoke tests — must run against `npm run dev` (not production build)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
TMPDIR="${TMPDIR:-/tmp/sishi-smoke}"
mkdir -p "$TMPDIR"
PASS=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1 (got: $2)"; FAIL=$((FAIL + 1)); }

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$name"; else fail "$name" "HTTP $actual, expected $expected"; fi
}

echo "=== Smoke tests against $BASE ==="

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "GET / returns 200" "200" "$code"

# 2. Admin login
admin_resp=$(curl -s -c "$TMPDIR/admin.txt" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$TMPDIR/admin.txt" "$BASE/admin")
if echo "$admin_resp" | grep -q '"ok":true'; then pass "POST /api/auth/admin/login"; else fail "POST /api/auth/admin/login" "$admin_resp"; fi

# 3. Admin dashboard accessible after login
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$TMPDIR/admin.txt" "$BASE/admin")
assert_status "GET /admin with cookie returns 200" "200" "$code"

# 4. Admin redirect without login
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
assert_status "GET /admin without cookie redirects 307" "307" "$code"

# 5. User login
user_resp=$(curl -s -c "$TMPDIR/user.txt" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
if echo "$user_resp" | grep -q '"ok":true'; then pass "POST /api/auth/login"; else fail "POST /api/auth/login" "$user_resp"; fi

# 6. User API without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/test/bid" \
  -H "Content-Type: application/json" -d '{"amount":100}')
assert_status "POST /api/m/* without cookie returns 401" "401" "$code"

# 7. Duplicate register returns 409
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123","name":"dup"}')
assert_status "POST /api/auth/register duplicate phone returns 409" "409" "$code"

# 8. Dev third-party token
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
assert_status "GET /api/dev/third-party-token returns 200" "200" "$code"

# 9. Upload without multipart returns 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$TMPDIR/admin.txt" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
assert_status "POST /api/upload non-multipart returns 400" "400" "$code"

# 10. Asset create without multipart returns 400
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$TMPDIR/admin.txt" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{"name":"test"}')
assert_status "POST /api/admin/assets non-multipart returns 400" "400" "$code"

# 11. Upload without auth returns 401
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
assert_status "POST /api/upload without auth returns 401" "401" "$code"

# 12. H5 pages load
for path in /m /m/login /m/auction /m/drying /m/me; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path returns 200" "200" "$code"
done

# 13. Admin login page
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "GET /admin/login returns 200" "200" "$code"

# 14. Find live auction and test bid
auction_id=$(curl -s -b "$TMPDIR/user.txt" "$BASE/m/auction" 2>/dev/null | grep -oP 'href="/m/auction/\K[^"]+' | head -1 || true)
if [ -n "$auction_id" ]; then
  bid_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$TMPDIR/user.txt" -X POST "$BASE/api/m/auction/$auction_id/bid" \
    -H "Content-Type: application/json" -d '{"amount":8200}')
  if [ "$bid_code" = "200" ]; then
    pass "POST /api/m/auction/[id]/bid succeeds (200)"
  else
    bid_body=$(curl -s -b "$TMPDIR/user.txt" -X POST "$BASE/api/m/auction/$auction_id/bid" \
      -H "Content-Type: application/json" -d '{"amount":8200}')
    fail "POST /api/m/auction/[id]/bid succeeds" "HTTP $bid_code: $bid_body"
  fi
else
  fail "POST /api/m/auction/[id]/bid" "no live auction found in /m/auction"
fi

# 15. Drying reserve API validation
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$TMPDIR/user.txt" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -d '{"listingId":"invalid","startDate":"2026-09-10","endDate":"2026-09-11"}')
if [ "$code" = "400" ] || [ "$code" = "404" ]; then
  pass "POST /api/m/drying/reserve validates input ($code)"
else
  fail "POST /api/m/drying/reserve validates input" "HTTP $code"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
