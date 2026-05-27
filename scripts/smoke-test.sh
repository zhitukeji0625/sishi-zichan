#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
PASS=0
FAIL=0

cleanup() { rm -f "$COOKIE_JAR" "$ADMIN_JAR"; }
trap cleanup EXIT

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_json() {
  local name="$1" field="$2" expected="$3" json="$4"
  local actual
  actual=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$field',''))" 2>/dev/null || echo "PARSE_ERROR")
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name ($field=$actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $field=$expected, got $actual)"
    echo "    body: $json"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke test: $BASE ==="

echo "[Pages]"
for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "$path" "200" "$code"
done

echo "[Admin login]"
ADMIN_RESP=$(curl -s -c "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
check_json "admin login" "ok" "True" "$ADMIN_RESP"

echo "[Admin protected page]"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin")
check "/admin (authenticated)" "200" "$code"

echo "[User login]"
USER_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
check_json "user login" "ok" "True" "$USER_RESP"

echo "[Third-party token (dev)]"
TP_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke_test_user")
TOKEN=$(echo "$TP_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
if [[ -n "$TOKEN" ]]; then
  echo "  ✓ third-party token issued"
  PASS=$((PASS + 1))
else
  echo "  ✗ third-party token missing"
  echo "    body: $TP_RESP"
  FAIL=$((FAIL + 1))
fi

echo "[Third-party SSO login]"
SSO_JAR=$(mktemp)
SSO_RESP=$(curl -s -c "$SSO_JAR" -X POST "$BASE/api/auth/third-party" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
check_json "third-party login" "ok" "True" "$SSO_RESP"
rm -f "$SSO_JAR"

echo "[User register (new phone)]"
NEW_PHONE="139$(date +%s | tail -c 9)"
REG_RESP=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$NEW_PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
check_json "register" "ok" "True" "$REG_RESP"

echo "[Fetch auction project ID from DB]"
PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT id FROM AuctionProject WHERE status='LIVE' LIMIT 1" 2>/dev/null || true)

if [[ -z "$PROJECT_ID" ]]; then
  echo "  ✗ no LIVE auction project found"
  FAIL=$((FAIL + 1))
else
  echo "  ✓ project id: $PROJECT_ID"
  PASS=$((PASS + 1))

  echo "[Place bid]"
  MIN_BID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "
    SELECT GREATEST(
      COALESCE((SELECT MAX(amount) FROM AuctionBid WHERE projectId='$PROJECT_ID'), 0) + p.bidStep,
      p.startPrice
    )
    FROM AuctionProject p WHERE p.id='$PROJECT_ID';
  " 2>/dev/null || echo "8000")
  BID_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$MIN_BID}")
  check_json "place bid" "ok" "True" "$BID_RESP"

  echo "[Reject low bid]"
  LOW_AMOUNT=$(python3 -c "print(float('$MIN_BID') + 1)")
  LOW_RESP=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":$LOW_AMOUNT}")
  LOW_CODE=$(echo "$LOW_RESP" | tail -1)
  if [[ "$LOW_CODE" == "400" ]]; then
    echo "  ✓ low bid rejected (400)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ low bid should be 400, got $LOW_CODE"
    FAIL=$((FAIL + 1))
  fi
fi

echo "[Drying reservation]"
LISTING_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e "SELECT id FROM DryingFieldListing WHERE status='OPERATING' LIMIT 1" 2>/dev/null || true)

if [[ -z "$LISTING_ID" ]]; then
  echo "  ✗ no drying listing found"
  FAIL=$((FAIL + 1))
else
  DRY_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/drying/reserve" \
    -H "Content-Type: application/json" \
    -d "{\"listingId\":\"$LISTING_ID\",\"startDate\":\"2026-06-01\",\"endDate\":\"2026-06-02\"}")
  check_json "drying reserve" "ok" "True" "$DRY_RESP"
  RES_ID=$(echo "$DRY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
fi

echo "[Admin assets API (GET list via page)]"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE/admin/assets")
check "/admin/assets" "200" "$code"

echo "[Logout]"
curl -s -o /dev/null -b "$COOKIE_JAR" -X POST "$BASE/api/auth/logout"
curl -s -o /dev/null -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/logout"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
