#!/usr/bin/env bash
# Smoke test for core API flows (requires dev server on :3000 and MariaDB)
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$ADMIN_JAR"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

db_query() {
  sudo docker exec mariadb mariadb -uroot -proot -N sishi -e "$1" 2>/dev/null
}

for path in / /m /m/login /admin/login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  [[ "$code" == "200" ]] || fail "GET $path => $code"
  ok "GET $path"
done

curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}' | grep -q '"ok":true' || fail "user login"
ok "user login"

curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}' | grep -q '"ok":true' || fail "admin login"
ok "admin login"

TOKEN=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-test-user" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
[[ -n "$TOKEN" ]] || fail "third-party token"
curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/third-party" \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\"}" | grep -q '"ok":true' || fail "third-party auth"
ok "third-party auth"

curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}' >/dev/null

PROJECT_ID=$(db_query "SELECT id FROM AuctionProject WHERE status='LIVE' LIMIT 1")
[[ -n "$PROJECT_ID" ]] || fail "no LIVE auction project (run npm run db:seed)"

CURRENT=$(db_query "SELECT COALESCE(MAX(b.amount), p.startPrice) FROM AuctionProject p LEFT JOIN AuctionBid b ON b.projectId=p.id WHERE p.id='$PROJECT_ID'")
STEP=$(db_query "SELECT bidStep FROM AuctionProject WHERE id='$PROJECT_ID'")
AMOUNT=$(python3 -c "print(float('$CURRENT') + float('$STEP'))")

curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
  -H 'Content-Type: application/json' \
  -d "{\"amount\":$AMOUNT}" | grep -q '"ok":true' || fail "place bid"
ok "place bid amount=$AMOUNT"

LISTING_ID=$(db_query "SELECT id FROM DryingFieldListing LIMIT 1")
[[ -n "$LISTING_ID" ]] || fail "no drying listing"
START=$(python3 -c "from datetime import date,timedelta; print((date.today()+timedelta(days=3)).isoformat())")
curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
  -H 'Content-Type: application/json' \
  -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"$START\",\"endDate\":\"$START\"}" | grep -q '"ok":true' || fail "drying reserve"
ok "drying reserve"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/assets")
[[ "$code" == "307" || "$code" == "302" || "$code" == "303" ]] || fail "admin assets unauth => $code"
ok "admin protected redirect"

echo "All smoke checks passed."
