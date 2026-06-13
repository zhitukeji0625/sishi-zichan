#!/bin/bash
# Comprehensive functional test
set -uo pipefail
BASE="http://localhost:3000"
COOKIE_JAR="/tmp/sishi-test-cookies.txt"
ADMIN_JAR="/tmp/sishi-admin-cookies.txt"
FAIL=0
PASS=0

pass() { echo "✓ $1"; PASS=$((PASS+1)); }
fail() { echo "✗ $1"; FAIL=$((FAIL+1)); }

check_page() {
  local name="$1" url="$2" expected="${3:-200}" jar="${4:-}"
  local code
  if [ -n "$jar" ]; then
    code=$(curl -s -b "$jar" -o /dev/null -w '%{http_code}' "$url")
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' "$url")
  fi
  if [ "$code" = "$expected" ]; then pass "$name ($code)"; else fail "$name expected $expected got $code"; fi
}

echo "========== PUBLIC PAGES =========="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/m/drying" "/admin/login"; do
  check_page "$path" "$BASE$path"
done

echo ""
echo "========== AUTH =========="
rm -f "$ADMIN_JAR" "$COOKIE_JAR"

ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
echo "$ADMIN_RESP" | grep -q '"ok":true' && pass "Admin login" || fail "Admin login: $ADMIN_RESP"

USER_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
echo "$USER_RESP" | grep -q '"ok":true' && pass "User login" || fail "User login: $USER_RESP"

# Bad password
BAD=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')
echo "$BAD" | grep -q 'error' && pass "Login rejects bad password" || fail "Login should reject bad password: $BAD"

# Third-party token
TP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-uid-001")
TOKEN=$(echo "$TP" | grep -oP '"token":"\K[^"]+' || true)
[ -n "$TOKEN" ] && pass "Dev third-party token" || fail "Dev third-party token: $TP"

# SSO page
if [ -n "$TOKEN" ]; then
  check_page "SSO page" "$BASE/m/sso?token=$TOKEN"
  TP_LOGIN=$(curl -s -c /tmp/sso-cookies.txt -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}")
  echo "$TP_LOGIN" | grep -q '"ok":true' && pass "Third-party auth API" || fail "Third-party auth: $TP_LOGIN"
fi

echo ""
echo "========== AUTHENTICATED PAGES (USER) =========="
for path in "/m/me" "/m/orders"; do
  check_page "$path" "$BASE$path" 200 "$COOKIE_JAR"
done

echo ""
echo "========== AUTHENTICATED PAGES (ADMIN) =========="
for path in "/admin" "/admin/assets" "/admin/assets/new" "/admin/auctions" "/admin/drying" \
  "/admin/announcements" "/admin/registrations" "/admin/organizations" "/admin/admins" \
  "/admin/dict" "/admin/config" "/admin/audit"; do
  check_page "$path" "$BASE$path" 200 "$ADMIN_JAR"
done

echo ""
echo "========== AUCTION =========="
AUCTION_ID=$(curl -s "$BASE/m/auction" | grep -oP '/m/auction/\K[a-z0-9]{20,}' | head -1 || true)
if [ -n "$AUCTION_ID" ]; then
  pass "Found auction project: $AUCTION_ID"
  check_page "Auction detail" "$BASE/m/auction/$AUCTION_ID" 200
  BID=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$AUCTION_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":8400}')
  echo "$BID" | grep -q '"ok":true' && pass "Auction bid" || fail "Auction bid: $BID"
else
  fail "No auction project found"
fi

echo ""
echo "========== DRYING =========="
DRYING_ID=$(curl -s "$BASE/m/drying" | grep -oP '/m/drying/\K[a-z0-9]{20,}' | head -1 || true)
if [ -n "$DRYING_ID" ]; then
  pass "Found drying listing: $DRYING_ID"
  check_page "Drying detail" "$BASE/m/drying/$DRYING_ID" 200
  TOMORROW=$(date -d "+2 days" +%Y-%m-%d 2>/dev/null || date -v+2d +%Y-%m-%d)
  RESERVE=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$DRYING_ID\",\"startDate\":\"$TOMORROW\",\"endDate\":\"$TOMORROW\"}")
  echo "$RESERVE" | grep -q '"ok":true' && pass "Drying reserve" || fail "Drying reserve: $RESERVE"
else
  fail "No drying listing found"
fi

echo ""
echo "========== ADMIN API =========="
ASSET_RESP=$(curl -s -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试资产","type":"LAND","locationText":"测试地点","orgId":"","status":"IDLE"}')
echo "$ASSET_RESP" | grep -q '"error"' && pass "Admin create asset rejects JSON body" || fail "Admin create asset should reject JSON: $ASSET_RESP"

echo ""
echo "========== REGISTER =========="
RAND_PHONE="139$(date +%s | tail -c 9)"
REG=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$RAND_PHONE\",\"password\":\"test123456\",\"name\":\"测试用户\",\"idCard\":\"650101199001011234\"}")
echo "$REG" | grep -q '"ok":true' && pass "User register" || fail "User register: $REG"

echo ""
echo "========== SUMMARY =========="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
