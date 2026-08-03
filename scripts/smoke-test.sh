#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_COOKIE=$(mktemp)
PASS=0
FAIL=0

cleanup() { rm -f "$COOKIE_JAR" "$ADMIN_COOKIE" /tmp/smoke_resp.json; }
trap cleanup EXIT

check() {
  local name="$1" expect="$2" actual="$3" body="${4:-}"
  if [ "$actual" = "$expect" ]; then
    echo "PASS: $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name expected=$expect actual=$actual body=$body"
    FAIL=$((FAIL + 1))
  fi
}

db_query() {
  sudo docker exec mariadb mariadb -uroot -proot -N sishi -e "$1" 2>/dev/null
}

echo "=== Smoke test against $BASE ==="

# Pages
for path in "/" "/m" "/admin/login" "/m/auction" "/m/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

# Auth validation
code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{}')
check "POST /api/auth/login empty" "400" "$code" "$(cat /tmp/smoke_resp.json)"

code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"wrong"}')
check "POST /api/auth/login wrong pwd" "401" "$code" "$(cat /tmp/smoke_resp.json)"

code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')
check "POST /api/auth/login ok" "200" "$code" "$(cat /tmp/smoke_resp.json)"

# Bid without auth
code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" -X POST "$BASE/api/m/auction/fake/bid" \
  -H 'Content-Type: application/json' -d '{"amount":1000}')
check "POST bid no auth" "401" "$code" "$(cat /tmp/smoke_resp.json)"

PROJECT=$(db_query "SELECT id FROM AuctionProject ORDER BY createdAt DESC LIMIT 1")
LISTING=$(db_query "SELECT id FROM DryingFieldListing LIMIT 1")

# Live bid
MIN_BID=$(db_query "SELECT COALESCE(MAX(amount), (SELECT startPrice FROM AuctionProject WHERE id='$PROJECT')) + (SELECT bidStep FROM AuctionProject WHERE id='$PROJECT') FROM AuctionBid WHERE projectId='$PROJECT'")
code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" -b "$COOKIE_JAR" \
  -X POST "$BASE/api/m/auction/$PROJECT/bid" \
  -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}")
check "POST bid on live auction" "200" "$code" "$(cat /tmp/smoke_resp.json)"

# Drying reserve
START=$(date -u -d '+10 days' +%Y-%m-%d)
END=$(date -u -d '+11 days' +%Y-%m-%d)
code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" -b "$COOKIE_JAR" \
  -X POST "$BASE/api/m/drying/reserve" \
  -H 'Content-Type: application/json' \
  -d "{\"listingId\":\"$LISTING\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
check "POST drying reserve" "200" "$code" "$(cat /tmp/smoke_resp.json)"

# Overlapping reservation
code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" -b "$COOKIE_JAR" \
  -X POST "$BASE/api/m/drying/reserve" \
  -H 'Content-Type: application/json' \
  -d "{\"listingId\":\"$LISTING\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
check "POST drying overlap" "409" "$code" "$(cat /tmp/smoke_resp.json)"

# Admin login
code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" -c "$ADMIN_COOKIE" \
  -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')
check "POST admin login" "200" "$code" "$(cat /tmp/smoke_resp.json)"

# Upload non-multipart
code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" -b "$ADMIN_COOKIE" \
  -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')
check "POST upload non-multipart" "400" "$code" "$(cat /tmp/smoke_resp.json)"

# Upload without file
code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" -b "$ADMIN_COOKIE" \
  -X POST "$BASE/api/upload" -F 'file=')
check "POST upload no file" "400" "$code" "$(cat /tmp/smoke_resp.json)"

# Company admin cannot create asset in parent org
REG=$(db_query "SELECT id FROM Organization WHERE code='REG61'")
code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" -c /tmp/co_admin.txt \
  -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' -d '{"phone":"13900000003","password":"admin123"}')
check "POST company admin login" "200" "$code" "$(cat /tmp/smoke_resp.json)"
code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" -b /tmp/co_admin.txt \
  -X POST "$BASE/api/admin/assets" \
  -F "orgId=$REG" -F "type=LAND" -F "name=smoke-test" -F "locationText=loc")
check "POST admin asset wrong org" "403" "$code" "$(cat /tmp/smoke_resp.json)"
rm -f /tmp/co_admin.txt

# Dev third-party token
code=$(curl -s -o /tmp/smoke_resp.json -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=smoke_test")
check "GET dev third-party-token" "200" "$code" "$(cat /tmp/smoke_resp.json)"

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
