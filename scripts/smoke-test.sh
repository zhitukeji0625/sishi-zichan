#!/usr/bin/env bash
# API smoke tests for sishi-zichan (run against npm run dev)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)

cleanup() { rm -f "$COOKIE_JAR" "$ADMIN_JAR" "$USER_JAR"; }
trap cleanup EXIT

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke tests @ $BASE ==="

# Pages
for path in "/" "/admin/login" "/m" "/m/auction" "/m/drying" "/m/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  assert_status "GET $path" "200" "$code"
done

# Admin login
ADMIN_RESP=$(curl -s -w "\n%{http_code}" -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
ADMIN_CODE=$(echo "$ADMIN_RESP" | tail -1)
ADMIN_BODY=$(echo "$ADMIN_RESP" | sed '$d')
assert_status "POST /api/auth/admin/login" "200" "$ADMIN_CODE"
assert_json_ok "admin login body" "$ADMIN_BODY"

# Admin dashboard
ADMIN_DASH=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
assert_status "GET /admin (authenticated)" "200" "$ADMIN_DASH"

# User login
USER_RESP=$(curl -s -w "\n%{http_code}" -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
USER_CODE=$(echo "$USER_RESP" | tail -1)
USER_BODY=$(echo "$USER_RESP" | sed '$d')
assert_status "POST /api/auth/login" "200" "$USER_CODE"
assert_json_ok "user login body" "$USER_BODY"

# Invalid login
BAD_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"wrong"}')
assert_status "POST /api/auth/login (bad password)" "401" "$BAD_CODE"

# Register new user
REG_PHONE="199$(date +%s | tail -c 9)"
REG_RESP=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$REG_PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
REG_CODE=$(echo "$REG_RESP" | tail -1)
REG_BODY=$(echo "$REG_RESP" | sed '$d')
assert_status "POST /api/auth/register" "200" "$REG_CODE"
assert_json_ok "register body" "$REG_BODY"

# Third-party token (dev)
TP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-user")
assert_status "GET /api/dev/third-party-token" "200" "$TP_CODE"

# Upload without auth
UPLOAD_NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
assert_status "POST /api/upload (no auth)" "401" "$UPLOAD_NOAUTH"

# Upload without multipart (should not 500)
UPLOAD_BAD=$(curl -s -w "\n%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/upload" \
  -H "Content-Type: application/json" -d '{}')
UPLOAD_BAD_CODE=$(echo "$UPLOAD_BAD" | tail -1)
if [[ "$UPLOAD_BAD_CODE" == "400" || "$UPLOAD_BAD_CODE" == "500" ]]; then
  if [[ "$UPLOAD_BAD_CODE" == "400" ]]; then
    echo "✓ POST /api/upload (non-multipart) returns 400"
    PASS=$((PASS + 1))
  else
    echo "✗ POST /api/upload (non-multipart) returns 500 (should be 400)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "✗ POST /api/upload (non-multipart) unexpected: $UPLOAD_BAD_CODE"
  FAIL=$((FAIL + 1))
fi

# Admin assets without multipart
ASSET_BAD=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" \
  -H "Content-Type: application/json" -d '{}')
if [[ "$ASSET_BAD" == "400" || "$ASSET_BAD" == "500" ]]; then
  if [[ "$ASSET_BAD" == "400" ]]; then
    echo "✓ POST /api/admin/assets (non-multipart) returns 400"
    PASS=$((PASS + 1))
  else
    echo "✗ POST /api/admin/assets (non-multipart) returns 500 (should be 400)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "✗ POST /api/admin/assets (non-multipart) unexpected: $ASSET_BAD"
  FAIL=$((FAIL + 1))
fi

# Get LIVE project and bid
PROJECT_ID=$(cd /workspace && npx tsx scripts/smoke-helpers.ts project-id 2>/dev/null || echo "")
if [[ -n "$PROJECT_ID" ]]; then
  MIN_BID=$(cd /workspace && npx tsx scripts/smoke-helpers.ts min-bid "$PROJECT_ID" 2>/dev/null || echo "8000")
  BID_RESP=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  BID_CODE=$(echo "$BID_RESP" | tail -1)
  BID_BODY=$(echo "$BID_RESP" | sed '$d')
  assert_status "POST /api/m/auction/$PROJECT_ID/bid" "200" "$BID_CODE"
  assert_json_ok "bid body" "$BID_BODY"
else
  echo "✗ No LIVE auction project found"
  FAIL=$((FAIL + 1))
fi

# Drying reservation
LISTING_ID=$(cd /workspace && npx tsx scripts/smoke-helpers.ts listing-id 2>/dev/null || echo "")
if [[ -n "$LISTING_ID" ]]; then
  START=$(date -d "+10 days" +%Y-%m-%d 2>/dev/null || date -v+10d +%Y-%m-%d)
  END=$(date -d "+11 days" +%Y-%m-%d 2>/dev/null || date -v+11d +%Y-%m-%d)
  DRY_RESP=$(curl -s -w "\n%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
  DRY_CODE=$(echo "$DRY_RESP" | tail -1)
  DRY_BODY=$(echo "$DRY_RESP" | sed '$d')
  assert_status "POST /api/m/drying/reserve" "200" "$DRY_CODE"
  assert_json_ok "drying reserve body" "$DRY_BODY"
else
  echo "✗ No OPERATING drying listing found"
  FAIL=$((FAIL + 1))
fi

# Logout
LOGOUT_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" -X POST "$BASE/api/auth/logout")
assert_status "POST /api/auth/logout" "200" "$LOGOUT_CODE"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
