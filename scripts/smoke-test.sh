#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAIL=0

check() {
  local name="$1" code="$2" expect="$3"
  if [ "$code" != "$expect" ]; then
    echo "FAIL: $name (got HTTP $code, want $expect)"
    FAIL=1
  else
    echo "OK: $name"
  fi
}

echo "=== Pages ==="
check "portal" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")" "200"
check "mobile home" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")" "200"
check "admin login" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")" "200"
check "mobile login" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")" "200"

echo "=== Admin auth ==="
RESP=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
check "admin login API" "$CODE" "200"
echo "$BODY" | grep -q '"ok":true' || { echo "FAIL: admin login body"; FAIL=1; }

check "admin dashboard" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin")" "200"

echo "=== End user auth ==="
RESP=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
CODE=$(echo "$RESP" | tail -1)
check "user login API" "$CODE" "200"

echo "=== Third-party token (dev) ==="
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=tp-smoke-001")
echo "$TOKEN_RESP" | grep -q 'token' || { echo "FAIL: third-party token"; FAIL=1; }
TOKEN=$(echo "$TOKEN_RESP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -n "$TOKEN" ]; then
  check "SSO page" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/sso?token=$TOKEN")" "200"
else
  echo "FAIL: could not parse token"
  FAIL=1
fi

echo "=== Auction bid (needs project id) ==="
PROJECT_ID=$(cd /workspace && npx tsx scripts/get-live-project.ts 2>/dev/null || true)
if [ -z "$PROJECT_ID" ]; then
  echo "SKIP: no LIVE auction project"
else
  RESP=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":8200}')
  CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  if [ "$CODE" = "200" ]; then
    echo "OK: bid placed"
  elif [ "$CODE" = "400" ] && echo "$BODY" | grep -qE '最低|increment|出价'; then
    echo "OK: bid rejected as expected (min increment)"
  else
    echo "FAIL: bid (HTTP $CODE) $BODY"
    FAIL=1
  fi
  check "auction detail page" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/auction/$PROJECT_ID")" "200"
fi

echo "=== Drying reserve ==="
LISTING_ID=$(cd /workspace && npx tsx scripts/get-drying-listing.ts 2>/dev/null || true)
if [ -z "$LISTING_ID" ]; then
  echo "SKIP: no drying listing"
else
  START=$(date -u -d "+2 days" +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  END=$(date -u -d "+3 days" +%Y-%m-%d 2>/dev/null || date -u -v+3d +%Y-%m-%d)
  RESP=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  CODE=$(echo "$RESP" | tail -1)
  if [ "$CODE" = "200" ] || [ "$CODE" = "409" ] || [ "$CODE" = "400" ]; then
    echo "OK: drying reserve ($CODE)"
  else
    echo "FAIL: drying reserve (HTTP $CODE)"
    FAIL=1
  fi
fi

rm -f "$COOKIE_JAR" "$ADMIN_JAR"
if [ "$FAIL" -eq 1 ]; then exit 1; fi
echo "=== All smoke checks passed ==="
