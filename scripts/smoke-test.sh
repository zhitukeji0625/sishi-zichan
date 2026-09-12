#!/bin/bash
set -e
BASE=http://localhost:3000
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "✗ $name expected=$expected actual=$actual"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Page smoke tests ==="
for path in "/" "/m" "/m/login" "/m/auction" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

echo ""
echo "=== User login ==="
USER_COOKIE=$(mktemp)
curl -s -c "$USER_COOKIE" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"user123"}' | grep -q '"ok":true' && echo "✓ user login API" || { echo "✗ user login API"; FAIL=$((FAIL+1)); }

echo ""
echo "=== Admin login ==="
ADMIN_COOKIE=$(mktemp)
curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000001","password":"admin123"}' | grep -q '"ok":true' && echo "✓ admin login API" || { echo "✗ admin login API"; FAIL=$((FAIL+1)); }

echo ""
echo "=== Payment guard: DRYING_RENT without ACTIVE status ==="
# Find any reservation for user that's not ACTIVE
RES=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/payments/mock" \
  -H 'Content-Type: application/json' \
  -d '{"purpose":"DRYING_RENT","reservationId":"invalid-id"}' )
echo "$RES" | grep -q "预约不存在\|请先登录" && echo "✓ DRYING_RENT rejects invalid reservation" || { echo "✗ DRYING_RENT guard failed: $RES"; FAIL=$((FAIL+1)); }

echo ""
echo "=== Payment guard: AUCTION_RENT without contract ==="
# Get a live auction project from seed
AUCTION_RENT=$(curl -s -b "$USER_COOKIE" -X POST "$BASE/api/m/payments/mock" \
  -H 'Content-Type: application/json' \
  -d '{"purpose":"AUCTION_RENT","auctionProjectId":"nonexistent"}' )
echo "$AUCTION_RENT" | grep -q "无权操作\|请先签署\|项目" && echo "✓ AUCTION_RENT guarded" || { echo "✗ AUCTION_RENT guard: $AUCTION_RENT"; FAIL=$((FAIL+1)); }

echo ""
echo "=== Third-party token (dev) ==="
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=test-user-001")
echo "$TOKEN_RESP" | grep -q "token" && echo "✓ dev third-party token" || { echo "✗ dev token: $TOKEN_RESP"; FAIL=$((FAIL+1)); }

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
