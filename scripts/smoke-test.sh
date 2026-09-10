#!/usr/bin/env bash
# API 冒烟测试（须在 dev 模式 localhost:3000 下运行）
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
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke Tests ($BASE) ==="

check "Homepage" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "Admin login page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/login")"
check "Mobile page" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/m")"
check "Admin login missing params" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{}')"
check "Admin login wrong password" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"wrong"}')"

RESP=$(curl -s -c "$COOKIE_JAR" -w '\n%{http_code}' -X POST "$BASE/api/auth/admin/login" -H 'Content-Type: application/json' -d '{"phone":"13900000001","password":"admin123"}')
check "Admin login success" "200" "$(echo "$RESP" | tail -1)"

RESP=$(curl -s -c "$USER_JAR" -w '\n%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"phone":"13800138000","password":"user123"}')
check "User login success" "200" "$(echo "$RESP" | tail -1)"
check "User login missing params" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{}')"
check "Register invalid params" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d '{"phone":"123","password":"1"}')"

PHONE="199$(date +%s | tail -c 9)"
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\",\"password\":\"test1234\",\"name\":\"冒烟测试\"}")
check "Register new user" "200" "$(echo "$RESP" | tail -1)"
check "Bid without login" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/auction/fake/bid" -H 'Content-Type: application/json' -d '{"amount":100}')"

# 触发 layout 中的演示竞拍续期
curl -s -o /dev/null "$BASE/"

AUCTION_HTML=$(curl -s "$BASE/m/auction")
PROJECT_ID=$(echo "$AUCTION_HTML" | grep -oE 'c[a-z0-9]{20,}' | head -1)
if [ -n "$PROJECT_ID" ]; then
  MIN_BID=$(npx tsx scripts/smoke-min-bid.ts "$PROJECT_ID" 2>/dev/null || echo "8000")
  BID_RESP=$(curl -s -b "$USER_JAR" -w '\n%{http_code}' -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" -H 'Content-Type: application/json' -d "{\"amount\":$MIN_BID}")
  CODE=$(echo "$BID_RESP" | tail -1)
  if [ "$CODE" = "200" ]; then
    echo "✓ Bid API success ($CODE)"
    PASS=$((PASS + 1))
  else
    echo "✗ Bid API failed ($CODE): $(echo "$BID_RESP" | head -n -1)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "✗ No auction project found in /m/auction"
  FAIL=$((FAIL + 1))
fi

check "Drying reserve without login" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/drying/reserve" -H 'Content-Type: application/json' -d '{}')"
check "Upload without login" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload")"
check "Upload non-multipart" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/upload" -H 'Content-Type: application/json' -d '{}')"
check "Admin assets non-multipart" "400" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "$BASE/api/admin/assets" -H 'Content-Type: application/json' -d '{}')"
check "Admin dashboard" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/admin")"
check "Dev third-party token" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/dev/third-party-token?u_id=test123")"
check "Mock payment without login" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/m/payments/mock" -H 'Content-Type: application/json' -d '{}')"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit "$FAIL"
