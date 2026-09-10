#!/usr/bin/env bash
# API smoke tests — run against dev server on localhost:3000
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TMPDIR="${TMPDIR:-/tmp}"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_json_ok() {
  local name="$1" body="$2"
  local ok
  ok=$(echo "$body" | python3 -c "import sys,json; print(str(json.load(sys.stdin).get('ok', False)).lower())" 2>/dev/null || echo "false")
  check "$name" "true" "$ok"
}

echo "=== Smoke tests against $BASE ==="

# Pages
check "homepage" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")"
check "admin login page" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/login")"
check "mobile page" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m")"
check "auction page" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/auction")"
check "drying page" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/m/drying")"

# Admin auth
check "admin login bad creds" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"wrong"}')"
ADMIN_RESP=$(curl -s -c "$TMPDIR/smoke_admin.txt" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}')
check_json_ok "admin login ok" "$ADMIN_RESP"

# User auth
check "user login bad creds" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"wrong"}')"
USER_RESP=$(curl -s -c "$TMPDIR/smoke_user.txt" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}')
check_json_ok "user login ok" "$USER_RESP"

# Upload / assets — non-multipart should return 400
check "upload no auth" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload")"
check "upload non-multipart" "400" "$(curl -s -o /dev/null -w "%{http_code}" -b "$TMPDIR/smoke_admin.txt" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')"
check "assets non-multipart" "400" "$(curl -s -o /dev/null -w "%{http_code}" -b "$TMPDIR/smoke_admin.txt" -X POST "$BASE/api/admin/assets" -H "Content-Type: application/json" -d '{}')"

# Register
PHONE="199$(date +%s | tail -c 9)"
REG_RESP=$(curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
check_json_ok "register ok" "$REG_RESP"

# Dev third-party token
check "dev third-party-token" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test123")"

# Drying reserve
check "drying reserve no auth" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d '{}')"
LISTING_ID=$(curl -s "$BASE/m/drying" | grep -oE 'c[a-z0-9]{20,}' | head -1)
if [ -n "$LISTING_ID" ]; then
  START=$(date -d "+5 days" +%Y-%m-%d 2>/dev/null || date -v+5d +%Y-%m-%d)
  END=$(date -d "+6 days" +%Y-%m-%d 2>/dev/null || date -v+6d +%Y-%m-%d)
  DRY_RESP=$(curl -s -b "$TMPDIR/smoke_user.txt" -X POST "$BASE/api/m/drying/reserve" -H "Content-Type: application/json" -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  check_json_ok "drying reserve ok" "$DRY_RESP"
else
  echo "FAIL: drying listing id not found"
  FAIL=$((FAIL + 1))
fi

# Auction bid
check "bid no auth" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" -H "Content-Type: application/json" -d '{"amount":100}')"
PROJECT_ID=$(curl -s "$BASE/m/auction" | grep -oE 'c[a-z0-9]{20,}' | head -1)
if [ -n "$PROJECT_ID" ]; then
  # Compute min bid from DB via a quick node script
  MIN_BID=$(cd "$(dirname "$0")/.." && npx tsx scripts/smoke-min-bid.ts "$PROJECT_ID" 2>/dev/null)
  if [ -n "$MIN_BID" ] && [ "$MIN_BID" != "0" ]; then
    BID_RESP=$(curl -s -b "$TMPDIR/smoke_user.txt" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H "Content-Type: application/json" -d "{\"amount\": $MIN_BID}")
    check_json_ok "auction bid ok" "$BID_RESP"
  else
    echo "FAIL: auction project not LIVE or not found (id=$PROJECT_ID)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "FAIL: auction project id not found"
  FAIL=$((FAIL + 1))
fi

# Logout
check "admin logout" "200" "$(curl -s -o /dev/null -w "%{http_code}" -b "$TMPDIR/smoke_admin.txt" -X POST "$BASE/api/auth/admin/logout")"
check "user logout" "200" "$(curl -s -o /dev/null -w "%{http_code}" -b "$TMPDIR/smoke_user.txt" -X POST "$BASE/api/auth/logout")"

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
