#!/usr/bin/env bash
# Functional smoke tests against running dev server (http://localhost:3000)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
PASS=0
FAIL=0

cleanup() { rm -f "$COOKIE_JAR" "$ADMIN_JAR"; }
trap cleanup EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3" body="${4:-}"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    [[ -n "$body" ]] && echo "    $body"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name"
    echo "    $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Health ==="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
assert_status "GET /" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")
assert_status "GET /m" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")
assert_status "GET /admin/login" "200" "$code"

echo "=== Auth: end user ==="
# Wrong password
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
assert_status "POST /api/auth/login wrong password" "401" "$code"

# Correct login
resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
assert_status "POST /api/auth/login" "200" "$code" "$body"
assert_json_ok "login returns ok" "$body"

echo "=== Auth: admin ==="
resp=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
assert_status "POST /api/auth/admin/login" "200" "$code" "$body"
assert_json_ok "admin login returns ok" "$body"

echo "=== Protected API without session ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/test/bid" \
  -H "Content-Type: application/json" -d '{"amount":8000}')
assert_status "POST /api/m/auction/bid unauthenticated" "401" "$code"

echo "=== Dev third-party token ==="
resp=$(curl -s -w "\n%{http_code}" "$BASE/api/dev/third-party-token?u_id=test_user")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
assert_status "GET /api/dev/third-party-token" "200" "$code"
TOKEN=$(echo "$body" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -n "$TOKEN" ]]; then
  echo "  ✓ token received"
  PASS=$((PASS + 1))
else
  echo "  ✗ token missing"
  FAIL=$((FAIL + 1))
fi

echo "=== Third-party SSO login ==="
SSO_JAR=$(mktemp)
resp=$(curl -s -w "\n%{http_code}" -c "$SSO_JAR" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
assert_status "POST /api/auth/third-party" "200" "$code" "$body"
assert_json_ok "third-party login ok" "$body"
rm -f "$SSO_JAR"

echo "=== Auction bid (needs LIVE project) ==="
# Get project ID from DB via API page or use env
PROJECT_ID="${AUCTION_PROJECT_ID:-}"
if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
    "SELECT id FROM AuctionProject WHERE code='DEMO_LIVE_AUCTION' AND status='LIVE' LIMIT 1;" 2>/dev/null || true)
  if [[ -z "$PROJECT_ID" ]]; then
    PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
      "SELECT id FROM AuctionProject WHERE status='LIVE' ORDER BY startsAt DESC LIMIT 1;" 2>/dev/null || true)
  fi
fi

if [[ -z "$PROJECT_ID" ]]; then
  echo "  ⚠ No LIVE auction project — skipping bid tests"
else
  # Bid below minimum
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":1}')
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  assert_status "POST bid too low" "400" "$code" "$body"

  # Valid bid — use current highest + step
  MIN_BID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
    "SELECT COALESCE(MAX(amount), (SELECT startPrice FROM AuctionProject WHERE id='$PROJECT_ID')) + (SELECT bidStep FROM AuctionProject WHERE id='$PROJECT_ID') FROM AuctionBid WHERE projectId='$PROJECT_ID';" 2>/dev/null || echo "8000")
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d "{\"amount\":$MIN_BID}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  if [[ "$code" == "200" ]]; then
    assert_json_ok "valid bid" "$body"
  else
    assert_status "POST valid bid" "200" "$code" "$body"
  fi
fi

echo "=== Drying reservation ==="
LISTING_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
  "SELECT id FROM DryingFieldListing LIMIT 1;" 2>/dev/null || true)
if [[ -n "$LISTING_ID" ]]; then
  START=$(date -u -d "+1 day" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+1d +%Y-%m-%dT00:00:00.000Z)
  END=$(date -u -d "+2 days" +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -v+2d +%Y-%m-%dT00:00:00.000Z)
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  if [[ "$code" == "200" || "$code" == "400" ]]; then
    echo "  ✓ drying reserve responded ($code)"
    PASS=$((PASS + 1))
  else
    assert_status "POST drying reserve" "200|400" "$code" "$body"
  fi
else
  echo "  ⚠ No drying listing — skipping"
fi

echo "=== Mock payment: duplicate check ==="
if [[ -n "$PROJECT_ID" ]]; then
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/payments/mock" \
    -H "Content-Type: application/json" \
    -d "{\"purpose\":\"AUCTION_DEPOSIT\",\"auctionProjectId\":\"$PROJECT_ID\"}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  # Should fail - deposit already paid (400 or 409)
  if [[ "$code" == "400" || "$code" == "409" ]]; then
    echo "  ✓ duplicate deposit rejected ($code)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ duplicate deposit (expected 400, got $code) $body"
    FAIL=$((FAIL + 1))
  fi

  # AUCTION_RENT on LIVE project should be rejected
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/payments/mock" \
    -H "Content-Type: application/json" \
    -d "{\"purpose\":\"AUCTION_RENT\",\"auctionProjectId\":\"$PROJECT_ID\"}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  assert_status "AUCTION_RENT on LIVE project rejected" "400" "$code" "$body"
fi

echo "=== Admin protected page ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/assets")
assert_status "GET /admin/assets with session" "200" "$code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
assert_status "GET /admin/assets without session redirects" "307" "$code"

echo "=== Logout ==="
resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout")
code=$(echo "$resp" | tail -n 1)
assert_status "POST /api/auth/logout" "200" "$code"

resp=$(curl -s -w "\n%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout")
code=$(echo "$resp" | tail -n 1)
assert_status "POST /api/auth/admin/logout" "200" "$code"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
