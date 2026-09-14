#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
FAIL=0
PASS=0

pass() { PASS=$((PASS + 1)); echo "OK: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $1 — $2"; }

expect_code() {
  local name="$1" expect="$2" url="$3"
  shift 3
  local got
  got=$(curl -s -o /dev/null -w "%{http_code}" "$url" "$@")
  if [ "$got" = "$expect" ]; then pass "$name ($got)"; else fail "$name" "expected $expect got $got"; fi
}

IDS=$(node "$(dirname "$0")/_query-ids.mjs")
read_json_field() {
  echo "$IDS" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); const k=process.argv[1]; console.log(j[k]??'');" "$1"
}
PROJECT_ID=$(read_json_field projectId)
MIN_BID=$(read_json_field minBidAmount)
LISTING_ID=$(read_json_field listingId)
ORG_ID=$(read_json_field orgId)

ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)

expect_code "GET /" 200 "$BASE/"
expect_code "GET /admin/login" 200 "$BASE/admin/login"
expect_code "GET /m" 200 "$BASE/m"
expect_code "POST admin login empty" 400 "$BASE/api/auth/admin/login" -X POST -H 'Content-Type: application/json' -d '{}'
expect_code "POST user login empty" 400 "$BASE/api/auth/login" -X POST -H 'Content-Type: application/json' -d '{}'

expect_code "POST admin login" 200 "$BASE/api/auth/admin/login" -X POST -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}' -c "$ADMIN_JAR"
expect_code "POST user login" 200 "$BASE/api/auth/login" -X POST -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}' -c "$USER_JAR"

expect_code "POST upload no auth" 401 "$BASE/api/upload" -X POST
expect_code "POST upload not multipart" 400 "$BASE/api/upload" -X POST -H 'Content-Type: application/json' -d '{}' -b "$ADMIN_JAR"
expect_code "POST admin assets not multipart" 400 "$BASE/api/admin/assets" -X POST -H 'Content-Type: application/json' -d '{}' -b "$ADMIN_JAR"

expect_code "POST drying reserve no auth" 401 "$BASE/api/m/drying/reserve" -X POST -H 'Content-Type: application/json' -d '{}'
expect_code "GET dev third-party token" 200 "$BASE/api/dev/third-party-token?u_id=smoke"

if [ -n "$PROJECT_ID" ]; then
  AMOUNT="${MIN_BID:-8000}"
  BID_BODY=$(curl -s -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H 'Content-Type: application/json' \
    -d "{\"amount\":$AMOUNT}" -b "$USER_JAR")
  if echo "$BID_BODY" | grep -q '"ok":true'; then pass "POST auction bid"; else fail "POST auction bid" "$BID_BODY"; fi
else
  fail "POST auction bid" "no LIVE project id"
fi

if [ -n "$LISTING_ID" ]; then
  START=$(date -u +%Y-%m-%d)
  END=$(date -u -d "+2 days" +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)
  RES_BODY=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}" -b "$USER_JAR")
  CODE=$(echo "$RES_BODY" | tail -1)
  if [ "$CODE" = "200" ]; then pass "POST drying reserve ($CODE)"; else fail "POST drying reserve" "$(echo "$RES_BODY" | head -1)"; fi
else
  fail "POST drying reserve" "no listing id"
fi

expect_code "POST admin logout" 200 "$BASE/api/auth/admin/logout" -X POST -b "$ADMIN_JAR"
expect_code "POST user logout" 200 "$BASE/api/auth/logout" -X POST -b "$USER_JAR"

rm -f "$ADMIN_JAR" "$USER_JAR"

echo "--- smoke: pass=$PASS fail=$FAIL ---"
[ "$FAIL" -eq 0 ]
