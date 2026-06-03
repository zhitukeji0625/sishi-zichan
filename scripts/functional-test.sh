#!/usr/bin/env bash
# Functional API smoke tests for sishi-zichan
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="/tmp/sishi-test-cookies.txt"
PASS=0
FAIL=0

log() { echo "[TEST] $*"; }
ok() { log "PASS: $1"; PASS=$((PASS+1)); }
fail() { log "FAIL: $1"; FAIL=$((FAIL+1)); }

http_code() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

json_post() {
  curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST "$1" \
    -H "Content-Type: application/json" \
    -d "$2"
}

json_get() {
  curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$1"
}

rm -f "$COOKIE_JAR"

# --- Public pages ---
for path in "/" "/m" "/m/login" "/admin/login"; do
  code=$(http_code "$BASE$path")
  if [[ "$code" == "200" ]]; then ok "GET $path -> $code"; else fail "GET $path -> $code (expected 200)"; fi
done

# --- User login ---
resp=$(json_post "$BASE/api/auth/login" '{"phone":"13800138000","password":"user123"}')
if echo "$resp" | grep -q '"ok":true'; then ok "user login"; else fail "user login: $resp"; fi

# --- Protected mobile page (should redirect or 200 with session) ---
code=$(http_code -b "$COOKIE_JAR" "$BASE/m/me")
if [[ "$code" == "200" ]]; then ok "GET /m/me with session -> $code"; else fail "GET /m/me -> $code"; fi

# --- Admin login ---
rm -f "$COOKIE_JAR"
resp=$(json_post "$BASE/api/auth/admin/login" '{"phone":"13900000001","password":"admin123"}')
if echo "$resp" | grep -q '"ok":true'; then ok "admin login"; else fail "admin login: $resp"; fi

code=$(http_code -b "$COOKIE_JAR" "$BASE/admin")
if [[ "$code" == "200" ]]; then ok "GET /admin with session -> $code"; else fail "GET /admin -> $code"; fi

# --- Admin assets page ---
code=$(http_code -b "$COOKIE_JAR" "$BASE/admin/assets")
if [[ "$code" == "200" ]]; then ok "GET /admin/assets -> $code"; else fail "GET /admin/assets -> $code"; fi

# --- Third party auth ---
rm -f "$COOKIE_JAR"
token=$(curl -s "$BASE/api/dev/third-party-token?u_id=func-test-user" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)
if [[ -n "$token" ]]; then
  resp=$(json_post "$BASE/api/auth/third-party" "{\"token\":\"$token\"}")
  if echo "$resp" | grep -q '"ok":true'; then ok "third-party login"; else fail "third-party login: $resp"; fi
else
  fail "dev third-party token"
fi

# --- Auction bid (need project id from seed) ---
rm -f "$COOKIE_JAR"
json_post "$BASE/api/auth/login" '{"phone":"13800138000","password":"user123"}' > /dev/null
# Find active auction project
auction_page=$(curl -s -b "$COOKIE_JAR" "$BASE/m/auction")
project_id=$(echo "$auction_page" | grep -oE '/m/auction/cm[a-z0-9]+' | head -1 | sed 's|.*/||' || true)
if [[ -n "$project_id" ]]; then
  resp=$(json_post "$BASE/api/m/auction/$project_id/bid" '{"amount":99999999}')
  if echo "$resp" | grep -q '"ok":true'; then ok "auction bid";
  elif echo "$resp" | grep -q '出价需不低于'; then ok "auction bid (LIVE, validation works)";
  elif echo "$resp" | grep -q '竞拍未在进行中'; then fail "auction bid: project not LIVE (run npm run db:seed)";
  else fail "auction bid: $resp"; fi
else
  log "SKIP auction bid (no project in page)"
fi

# --- Invalid login ---
rm -f "$COOKIE_JAR"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')
if [[ "$code" == "401" ]]; then ok "invalid login -> 401"; else fail "invalid login -> $code"; fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
