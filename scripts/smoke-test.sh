#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$ADMIN_JAR" "$USER_JAR"' EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_json_ok() {
  local name="$1" body="$2"
  if echo "$body" | grep -q '"ok":true'; then
    echo "✓ $name"
    PASS=$((PASS + 1))
  else
    echo "✗ $name: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test @ $BASE ==="

check "GET /" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "GET /admin/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "GET /m/login" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/login")"
check "POST admin login wrong pwd" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"wrong"}')"

ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')
check_json_ok "POST admin login" "$ADMIN_RESP"
check "GET /admin with session" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/admin")"

USER_RESP=$(curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')
check_json_ok "POST user login" "$USER_RESP"
check "POST user login wrong" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"wrong"}')"

REG_PHONE="199$(date +%s | tail -c 9)"
REG_RESP=$(curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d "{\"phone\":\"$REG_PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
check_json_ok "POST register" "$REG_RESP"

TP_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test123")
if echo "$TP_RESP" | grep -q 'token'; then
  echo "✓ GET third-party-token"
  PASS=$((PASS + 1))
else
  echo "✗ GET third-party-token: $TP_RESP"
  FAIL=$((FAIL + 1))
fi

check "POST upload non-multipart" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')"
check "POST admin/assets non-multipart" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{}')"

PROJECT_JSON=$(cd "$(dirname "$0")/.." && npx tsx scripts/db-query.ts live-project)
PROJECT_ID=$(echo "$PROJECT_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{console.log(JSON.parse(s).id||'')}catch{console.log('')}})")
MIN_BID=$(echo "$PROJECT_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{console.log(JSON.parse(s).minBid||0)}catch{console.log(0)}})")

if [ -n "$PROJECT_ID" ]; then
  check "Bid without login" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H 'Content-Type: application/json' -d '{"amount":100}')"
  BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}")
  check_json_ok "POST bid (amount=$MIN_BID)" "$BID_RESP"
else
  echo "✗ No LIVE project (run npm run db:seed)"
  FAIL=$((FAIL + 1))
fi

LISTING_ID=$(cd "$(dirname "$0")/.." && npx tsx scripts/db-query.ts drying-listing)
START_DATE=$(date -d "+3 days" +%Y-%m-%d 2>/dev/null || date -v+3d +%Y-%m-%d)
END_DATE=$(date -d "+4 days" +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
if [ -n "$LISTING_ID" ]; then
  DRY_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START_DATE\",\"endDate\":\"$END_DATE\"}")
  check_json_ok "POST drying reserve" "$DRY_RESP"
else
  echo "✗ No OPERATING drying listing"
  FAIL=$((FAIL + 1))
fi

check "GET /m" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "GET /m/auction" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$USER_JAR" "$BASE/m/auction")"
check "GET /m/drying" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m/drying")"

echo ""
echo "Results: $PASS passed, $FAIL failed"
exit "$FAIL"
