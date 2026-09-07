#!/usr/bin/env bash
# API smoke tests — run against `npm run dev` on localhost:3000
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [[ "$actual" == "$expected" ]]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expected, got $actual) $body"
    FAIL=$((FAIL + 1))
  fi
}

# 1. Homepage
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "homepage" "200" "$code"

# 2. Mobile H5
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
assert_status "mobile H5" "200" "$code"

# 3. Admin login page redirect when not logged in
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin")
assert_status "admin unauthenticated redirect" "307" "$code"

# 4. Admin login bad credentials
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"wrong"}')
code=$(echo "$resp" | tail -1)
assert_status "admin login wrong password" "401" "$code"

# 5. Admin login success
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -n -1)
assert_status "admin login success" "200" "$code" "$body"

# 6. Upload without auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")
assert_status "upload no auth" "401" "$code"

# 7. Upload non-multipart (should not 500)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
assert_status "upload non-multipart" "400" "$code"

# 8. Asset create non-multipart
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
assert_status "asset create non-multipart" "400" "$code"

# 9. User login
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
code=$(echo "$resp" | tail -1)
assert_status "user login" "200" "$code"

# 10. Third-party token (dev only)
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test001")
assert_status "third-party token dev" "200" "$code"

# 11. Bid without login
# Get a live project id from DB
PROJECT_ID=$(cd "$(dirname "$0")/.." && npx tsx scripts/get-demo-ids.ts project 2>/dev/null || echo "")
if [[ -z "$PROJECT_ID" ]]; then
  echo "SKIP: bid tests (no project id)"
else
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":1000000}')
  assert_status "bid no auth" "401" "$code"

  # 12. Bid with login (amount above current max + step)
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx scripts/get-demo-ids.ts minbid 2>/dev/null || echo "1000000")
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  assert_status "bid with auth" "200" "$code" "$body"
fi

# 13. Drying reserve bad params
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H "Content-Type: application/json" -d '{}')
assert_status "drying reserve bad params" "400" "$code"

# 14. Drying reserve success
LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx scripts/get-demo-ids.ts listing 2>/dev/null || echo "")
if [[ -n "$LISTING_ID" ]]; then
  START=$(date -u -d "+2 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+2d +%Y-%m-%dT00:00:00.000Z)
  END=$(date -u -d "+3 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+3d +%Y-%m-%dT00:00:00.000Z)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  assert_status "drying reserve" "200" "$code" "$body"
fi

# 15. Favicon
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/favicon.ico")
if [[ "$code" == "200" || "$code" == "308" || "$code" == "404" ]]; then
  echo "PASS: favicon ($code)"
  PASS=$((PASS + 1))
else
  echo "FAIL: favicon (got $code)"
  FAIL=$((FAIL + 1))
fi

# 16. Register validation
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" -d '{}')
assert_status "register bad params" "400" "$code"

# 17. Mock payment no auth
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/payments/mock" \
  -H "Content-Type: application/json" -d '{}')
assert_status "mock payment no auth" "401" "$code"

# 18. Admin logout
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
assert_status "admin logout" "200" "$code"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
