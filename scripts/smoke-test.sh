#!/usr/bin/env bash
# API / page smoke tests for local dev server
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT
FAIL=0

check() {
  local name="$1" expect="$2" actual="$3"
  if [[ "$actual" != "$expect" ]]; then
    echo "FAIL: $name (expected HTTP $expect, got $actual)"
    FAIL=$((FAIL + 1))
  else
    echo "OK: $name"
  fi
}

check_json() {
  local name="$1" body="$2" pattern="$3"
  if echo "$body" | grep -qE "$pattern"; then
    echo "OK: $name"
  else
    echo "FAIL: $name (body: $body)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Pages ==="
check "GET /" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /m/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "GET /m/auction" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/auction")"
check "GET /m/drying" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"
check "GET /admin/login" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"

echo "=== Auth (unauthenticated) ==="
check "POST bid without login" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/fake/bid" -H 'Content-Type: application/json' -d '{"amount":100}')"

echo "=== End user login ==="
USER_RESP=$(curl -s -w '\n%{http_code}' -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')
USER_CODE=$(echo "$USER_RESP" | tail -1)
USER_BODY=$(echo "$USER_RESP" | sed '$d')
check "POST /api/auth/login" 200 "$USER_CODE"
check_json "login ok" "$USER_BODY" '"ok":true'

echo "=== Protected mobile pages ==="
check "GET /m/me" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/me")"
check "GET /m/orders" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/m/orders")"

echo "=== Auction bid ==="
PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
  "SELECT id FROM AuctionProject WHERE status='LIVE' ORDER BY createdAt DESC LIMIT 1;" 2>/dev/null | tr -d '\r' || true)

if [[ -z "$PROJECT_ID" ]]; then
  echo "SKIP: no LIVE auction project"
else
  BID_RESP=$(curl -s -w '\n%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H 'Content-Type: application/json' -d '{"amount":8200}')
  BID_CODE=$(echo "$BID_RESP" | tail -1)
  BID_BODY=$(echo "$BID_RESP" | sed '$d')
  if [[ "$BID_CODE" == "200" ]]; then
    echo "OK: POST bid"
  elif [[ "$BID_CODE" == "400" ]] && echo "$BID_BODY" | grep -qE '最低|increment|出价'; then
    echo "OK: POST bid (expected min increment error after prior bid)"
  else
    echo "FAIL: POST bid (HTTP $BID_CODE body: $BID_BODY)"
    FAIL=$((FAIL + 1))
  fi
fi

echo "=== Drying reserve ==="
LISTING_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
  "SELECT id FROM DryingFieldListing WHERE status='OPERATING' LIMIT 1;" 2>/dev/null | tr -d '\r' || true)

if [[ -z "$LISTING_ID" ]]; then
  echo "SKIP: no drying listing"
else
  DRY_RESP=$(curl -s -w '\n%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-06-10\",\"endDate\":\"2026-06-12\"}")
  DRY_CODE=$(echo "$DRY_RESP" | tail -1)
  DRY_BODY=$(echo "$DRY_RESP" | sed '$d')
  if [[ "$DRY_CODE" == "200" ]]; then
    echo "OK: POST drying reserve"
  elif [[ "$DRY_CODE" == "400" ]]; then
    echo "OK: POST drying reserve (validation: $DRY_BODY)"
  else
    echo "FAIL: POST drying reserve (HTTP $DRY_CODE body: $DRY_BODY)"
    FAIL=$((FAIL + 1))
  fi
fi

echo "=== Admin login ==="
ADMIN_COOKIE=$(mktemp)
ADMIN_RESP=$(curl -s -w '\n%{http_code}' -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_RESP" | tail -1)
ADMIN_BODY=$(echo "$ADMIN_RESP" | sed '$d')
check "POST /api/auth/admin/login" 200 "$ADMIN_CODE"
check_json "admin login" "$ADMIN_BODY" '"role"'

check "GET /admin" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" "$BASE/admin")"
check "GET /admin/assets" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" "$BASE/admin/assets")"
check "GET /admin/auctions" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_COOKIE" "$BASE/admin/auctions")"

rm -f "$ADMIN_COOKIE"

echo "=== Dev third-party token ==="
TP_RESP=$(curl -s -w '\n%{http_code}' "$BASE/api/dev/third-party-token?phone=13800138000")
TP_CODE=$(echo "$TP_RESP" | tail -1)
TP_BODY=$(echo "$TP_RESP" | sed '$d')
check "GET third-party-token" 200 "$TP_CODE"
check_json "token present" "$TP_BODY" 'token'

echo ""
if [[ $FAIL -gt 0 ]]; then
  echo "Smoke tests failed: $FAIL error(s)"
  exit 1
fi
echo "All smoke tests passed."
