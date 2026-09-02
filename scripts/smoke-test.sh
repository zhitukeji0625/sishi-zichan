#!/usr/bin/env bash
# 功能完整性冒烟测试 — 须从仓库根目录运行: npm run test:smoke
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
COOKIE_JAR="/tmp/smoke-cookies.txt"
USER_JAR="/tmp/smoke-user-cookies.txt"
rm -f "$COOKIE_JAR" "$USER_JAR"

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name ($actual)"
    PASS=$((PASS+1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

check_bool() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✓ $name"
    PASS=$((PASS+1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL+1))
  fi
}

for path in "/" "/m" "/m/login" "/m/auction" "/m/drying" "/admin/login"; do
  check "GET $path" "200" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")"
done

curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}' > /dev/null
check_bool "POST /api/auth/admin/login" "true" "$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/auth/admin/login" -H "Content-Type: application/json" -d '{"phone":"13900000001","password":"admin123"}' | python3 -c "import sys,json; print(str(json.load(sys.stdin).get('ok',False)).lower())")"

for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/dict" "/admin/drying" "/admin/organizations" "/admin/admins"; do
  check "GET $path" "200" "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE$path")"
done

DICT_HTML=$(curl -s -b "$COOKIE_JAR" "$BASE/admin/dict")
if echo "$DICT_HTML" | grep -q "资产类型"; then
  echo "✓ Dict categories seeded"
  PASS=$((PASS+1))
else
  echo "✗ Dict categories missing"
  FAIL=$((FAIL+1))
fi

curl -s -c "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}' > /dev/null
check_bool "POST /api/auth/login" "true" "$(curl -s -b "$USER_JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"phone":"13800138000","password":"user123"}' | python3 -c "import sys,json; print(str(json.load(sys.stdin).get('ok',False)).lower())")"

for path in "/m/me" "/m/orders"; do
  check "GET $path" "200" "$(curl -s -b "$USER_JAR" -o /dev/null -w "%{http_code}" "$BASE$path")"
done

check_bool "GET /api/dev/third-party-token" "true" "$(curl -s "$BASE/api/dev/third-party-token?u_id=test-user-001" | python3 -c "import sys,json; print(str(bool(json.load(sys.stdin).get('token'))).lower())")"
check "POST /api/upload (no auth)" "401" "$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')"
check "POST /api/upload (no file)" "400" "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload" -H "Content-Type: application/json" -d '{}')"

AUCTION_HTML=$(curl -s -b "$USER_JAR" "$BASE/m/auction")
PROJECT_ID=$(echo "$AUCTION_HTML" | grep -oP 'href="/m/auction/\K[a-z0-9]+' | head -1)
echo "Project ID: $PROJECT_ID"
if [ -n "$PROJECT_ID" ]; then
  check "GET /m/auction/$PROJECT_ID" "200" "$(curl -s -b "$USER_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction/$PROJECT_ID")"
  DETAIL=$(curl -s -b "$USER_JAR" "$BASE/m/auction/$PROJECT_ID")
  MIN_BID=$(echo "$DETAIL" | grep -oP 'name="amount"[^>]*value="\K[0-9.]+' | head -1)
  if [ -z "$MIN_BID" ]; then
    MIN_BID=$(echo "$DETAIL" | grep -oP '最低[出价]*[：:]\s*[¥￥]?\K[0-9.]+' | head -1)
  fi
  if [ -z "$MIN_BID" ]; then MIN_BID=8400; fi
  echo "Min bid: $MIN_BID"
  BID_RESP=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d "{\"amount\": $MIN_BID}")
  echo "Bid: $BID_RESP"
  check_bool "POST bid success" "true" "$(echo "$BID_RESP" | python3 -c "import sys,json; print(str(json.load(sys.stdin).get('ok',False)).lower())")"
else
  echo "✗ No auction project found"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit "$FAIL"
