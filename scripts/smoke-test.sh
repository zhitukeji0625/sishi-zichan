#!/usr/bin/env bash
# Functional smoke test for sishi-zichan
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
PASS=0
FAIL=0

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_contains() {
  local name="$1"
  local needle="$2"
  local haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (missing: $needle)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke Test: $BASE ==="

# 1. Public pages
echo "[Pages]"
for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# 2. Protected pages redirect or 200
echo "[Protected pages]"
code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/m/me")
check "GET /m/me (redirect/login)" "200" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/admin")
check "GET /admin (redirect/login)" "200" "$code"

# 3. Admin login
echo "[Admin auth]"
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "POST /api/auth/admin/login" "200" "$code"
check_contains "admin login ok" '"ok":true' "$body"

# 4. Admin dashboard
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/admin")
check "GET /admin (authenticated)" "200" "$code"

# 5. User login
echo "[User auth]"
USER_JAR=$(mktemp)
resp=$(curl -s -w "\n%{http_code}" -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "POST /api/auth/login" "200" "$code"
check_contains "user login ok" '"ok":true' "$body"

# 6. User pages
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" "$BASE/m/me")
check "GET /m/me (authenticated)" "200" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" "$BASE/m/orders")
check "GET /m/orders (authenticated)" "200" "$code"

# 7. Dev third-party token
echo "[Dev SSO]"
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-sso-user")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "GET /api/dev/third-party-token" "200" "$code"
check_contains "third-party token" '"token"' "$body"

# 8. Bid on live auction
echo "[Auction bid]"
PROJECT_ID=$(cd /workspace && npx tsx scripts/smoke-bid-info.ts 2>/dev/null || true)

if [[ -z "$PROJECT_ID" ]]; then
  echo "  ✗ No LIVE auction project found"
  FAIL=$((FAIL + 1))
else
  PID=$(echo "$PROJECT_ID" | awk '{print $1}')
  MIN_BID=$(echo "$PROJECT_ID" | awk '{print $2}')
  resp=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "POST /api/m/auction/$PID/bid" "200" "$code"
  check_contains "bid success" '"ok":true' "$body"
fi

# 9. Admin dict page (checks dict data)
echo "[Admin features]"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/admin/dict")
check "GET /admin/dict" "200" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/admin/auctions")
check "GET /admin/auctions" "200" "$code"

# 10. Unauthenticated bid should fail
echo "[Auth guards]"
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/auction/fake-id/bid" \
  -H "Content-Type: application/json" \
  -d '{"amount":1000}')
code=$(echo "$resp" | tail -n 1)
if [[ "$code" == "401" || "$code" == "403" ]]; then
  echo "  ✓ Unauthenticated bid rejected ($code)"
  PASS=$((PASS + 1))
else
  echo "  ✗ Unauthenticated bid should be 401/403 (got $code)"
  FAIL=$((FAIL + 1))
fi

rm -f "$COOKIE_JAR" "$USER_JAR"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
