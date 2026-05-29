#!/usr/bin/env bash
# Integration smoke tests against local dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

fail() { echo "FAIL: $1"; exit 1; }
ok() { echo "OK: $1"; }

# --- Public pages ---
for path in / /m /admin/login /m/login /m/register; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  [[ "$code" == "200" ]] || fail "$path returned $code"
done
ok "public pages"

# --- Admin login ---
resp=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$resp" | grep -q '"ok":true' || fail "admin login: $resp"
ok "admin login"

# Protected admin API (assets list via page - use admin assets API)
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/admin/assets")
[[ "$code" == "200" ]] || fail "admin assets page $code"
ok "admin protected page"

# --- End user login ---
rm -f "$COOKIE_JAR"
touch "$COOKIE_JAR"
resp=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$resp" | grep -q '"ok":true' || fail "user login: $resp"
ok "user login"

# Get LIVE auction project from DB
IDS=$(cd /workspace && npx tsx scripts/query-test-ids.ts)
PROJECT_ID=$(echo "$IDS" | sed -n 's/.*"projectId":"\([^"]*\)".*/\1/p')
LISTING_ID=$(echo "$IDS" | sed -n 's/.*"listingId":"\([^"]*\)".*/\1/p')
BID_AMOUNT=$(echo "$IDS" | sed -n 's/.*"bidAmount":"\([^"]*\)".*/\1/p')
[[ -n "$PROJECT_ID" ]] || fail "no LIVE auction project in DB"
ok "found auction project $PROJECT_ID"

resp=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
  -H "Content-Type: application/json" \
  -d "{\"amount\":$BID_AMOUNT}")
echo "$resp" | grep -q '"ok":true' || fail "bid: $resp"
ok "auction bid $BID_AMOUNT"

# --- Drying reserve ---
if [[ -n "$LISTING_ID" ]]; then
  resp=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-06-01\",\"endDate\":\"2026-06-03\"}")
  echo "$resp" | grep -q '"ok":true' || fail "drying reserve: $resp"
  ok "drying reservation"
fi

# --- Third party dev token ---
resp=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-integration")
echo "$resp" | grep -q 'token' || fail "third-party token: $resp"
TOKEN=$(echo "$resp" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[[ -n "$TOKEN" ]] || fail "could not parse token"

rm -f "$COOKIE_JAR"
touch "$COOKIE_JAR"
resp=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
echo "$resp" | grep -q '"ok":true' || fail "third-party auth: $resp"
ok "third-party SSO"

# --- Register new user (unique 11-digit phone) ---
PHONE=$(node -e "console.log('199'+String(Date.now()).slice(-8))")
resp=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"集成测试\"}")
echo "$resp" | grep -q '"ok":true' || fail "register: $resp"
ok "user register $PHONE"

# --- Invalid login ---
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
[[ "$code" == "401" ]] || fail "bad password should 401 got $code"
ok "auth rejection"

echo ""
echo "All integration checks passed."
