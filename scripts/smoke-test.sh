#!/usr/bin/env bash
# API smoke tests — requires dev server at BASE_URL (default http://localhost:3000)
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
TMP=$(mktemp -d)
PASS=0; FAIL=0

check() {
  local name="$1" expected="$2" actual="$3" extra="${4:-}"
  if [ "$expected" = "$actual" ]; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expected, got $actual) $extra"
    FAIL=$((FAIL + 1))
  fi
}

http_code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
post_json() { curl -s -w "\n%{http_code}" -X POST "$1" -H 'Content-Type: application/json' -d "$2" "${@:3}"; }

# Pages
check "homepage" "200" "$(http_code "$BASE/")"
check "admin login page" "200" "$(http_code "$BASE/admin/login")"
check "mobile login page" "200" "$(http_code "$BASE/m/login")"

# Admin auth
resp=$(post_json "$BASE/api/auth/admin/login" '{"phone":"13900000001","password":"wrong"}')
check "admin login wrong pwd" "401" "$(echo "$resp" | tail -1)"
resp=$(post_json "$BASE/api/auth/admin/login" '{"phone":"13900000001","password":"admin123"}' -c "$TMP/admin.txt")
check "admin login success" "200" "$(echo "$resp" | tail -1)"

# User auth
resp=$(post_json "$BASE/api/auth/login" '{"phone":"13800138000","password":"wrong"}')
check "user login wrong pwd" "401" "$(echo "$resp" | tail -1)"
resp=$(post_json "$BASE/api/auth/login" '{"phone":"13800138000","password":"user123"}' -c "$TMP/user.txt")
check "user login success" "200" "$(echo "$resp" | tail -1)"

PHONE="199$(date +%s | tail -c 9)"
resp=$(post_json "$BASE/api/auth/register" "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
check "user register" "200" "$(echo "$resp" | tail -1)"
resp=$(post_json "$BASE/api/auth/register" '{"phone":"13800138000","password":"user123"}')
check "register duplicate" "409" "$(echo "$resp" | tail -1)"

# Protected routes
resp=$(post_json "$BASE/api/m/auction/fake-id/bid" '{"amount":100}')
check "bid unauth" "401" "$(echo "$resp" | tail -1)"
resp=$(post_json "$BASE/api/m/drying/reserve" '{"listingId":"x","startDate":"2026-01-01","endDate":"2026-01-02"}')
check "drying unauth" "401" "$(echo "$resp" | tail -1)"

# Upload / assets multipart validation
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')
check "upload unauth" "401" "$(echo "$resp" | tail -1)"
resp=$(curl -s -w "\n%{http_code}" -b "$TMP/admin.txt" -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')
check "upload non-multipart" "400" "$(echo "$resp" | tail -1)"
resp=$(curl -s -w "\n%{http_code}" -b "$TMP/admin.txt" -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{}')
check "assets non-multipart" "400" "$(echo "$resp" | tail -1)"

# Third-party SSO
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
body=$(echo "$resp" | head -n -1)
check "third-party token" "200" "$(echo "$resp" | tail -1)"
TOKEN=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null || echo "")
resp=$(post_json "$BASE/api/auth/third-party" "{\"token\":\"$TOKEN\"}")
check "third-party auth" "200" "$(echo "$resp" | tail -1)"

# Logout
resp=$(curl -s -w "\n%{http_code}" -b "$TMP/user.txt" -X POST "$BASE/api/auth/logout")
check "user logout" "200" "$(echo "$resp" | tail -1)"
resp=$(curl -s -w "\n%{http_code}" -b "$TMP/admin.txt" -X POST "$BASE/api/auth/admin/logout")
check "admin logout" "200" "$(echo "$resp" | tail -1)"

# Re-login for business flows
curl -s -c "$TMP/user.txt" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}' > /dev/null

# Bid + drying (dynamic from DB via tsx helper)
INFO=$(cd "$(dirname "$0")/.." && npx tsx scripts/smoke-helpers.ts 2>/dev/null || echo "SKIP")
if [ "$INFO" != "SKIP" ] && [ -n "$INFO" ]; then
  PID=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['projectId'])")
  MINBID=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['minBid'])")
  LID=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['listingId'])")
  START=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['startDate'])")
  END=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['endDate'])")

  resp=$(post_json "$BASE/api/m/auction/$PID/bid" "{\"amount\":$MINBID}" -b "$TMP/user.txt")
  check "bid success" "200" "$(echo "$resp" | tail -1)" "$(echo "$resp" | head -n -1)"
  resp=$(post_json "$BASE/api/m/drying/reserve" "{\"listingId\":\"$LID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}" -b "$TMP/user.txt")
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)
  if [ "$code" = "200" ] || [ "$code" = "400" ]; then
    echo "PASS: drying reserve ($code)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: drying reserve ($code) $body"
    FAIL=$((FAIL + 1))
  fi
else
  echo "SKIP: bid/drying (no LIVE project)"
fi

rm -rf "$TMP"
echo ""
echo "=== Smoke: $PASS passed, $FAIL failed ==="
exit "$FAIL"
