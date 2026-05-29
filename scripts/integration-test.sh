#!/bin/bash
# Integration smoke tests against running server (npm run start or dev)
set -e
BASE="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR=$(mktemp)
ADMIN_COOKIE=$(mktemp)
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $name (expected $expected, got $actual)"
    FAIL=1
  else
    echo "OK: $name"
  fi
}

trap 'rm -f "$COOKIE_JAR" "$ADMIN_COOKIE"' EXIT

for path in "/" "/m" "/m/login" "/m/register" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"user123"}')
echo "$LOGIN" | grep -q '"ok":true' && echo "OK: user login" || { echo "FAIL: user login: $LOGIN"; FAIL=1; }

ADMIN_LOGIN=$(curl -s -c "$ADMIN_COOKIE" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13900000001","password":"admin123"}')
echo "$ADMIN_LOGIN" | grep -q '"ok":true' && echo "OK: admin login" || { echo "FAIL: admin login: $ADMIN_LOGIN"; FAIL=1; }

code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/me")
check "GET /m/me (authenticated)" "200" "$code"

code=$(curl -s -b "$ADMIN_COOKIE" -o /dev/null -w "%{http_code}" "$BASE/admin")
check "GET /admin (authenticated)" "200" "$code"

TOKEN_CODE=$(curl -s -o /tmp/tp-token.json -w "%{http_code}" "$BASE/api/dev/third-party-token?u_id=test-integration-user")
TOKEN_RESP=$(cat /tmp/tp-token.json)
if [ "$TOKEN_CODE" = "404" ] || echo "$TOKEN_RESP" | grep -q '不可用'; then
  echo "SKIP: third-party token (disabled in production)"
elif echo "$TOKEN_RESP" | grep -q 'token'; then
  echo "OK: third-party token"
  TOKEN=$(echo "$TOKEN_RESP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  curl -s -c "$COOKIE_JAR" "$BASE/m/sso?token=$TOKEN" > /dev/null
  code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/me")
  check "SSO login + /m/me" "200" "$code"
else
  echo "FAIL: third-party token: $TOKEN_RESP"
  FAIL=1
fi
rm -f /tmp/tp-token.json

for path in /m/auction /m/drying /m/orders; do
  code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE$path")
  check "GET $path" "200" "$code"
done

PROJECT_ID=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
  "SELECT id FROM AuctionProject WHERE status='LIVE' LIMIT 1" 2>/dev/null || true)
if [ -n "$PROJECT_ID" ]; then
  code=$(curl -s -b "$COOKIE_JAR" -o /dev/null -w "%{http_code}" "$BASE/m/auction/$PROJECT_ID")
  check "GET /m/auction/$PROJECT_ID" "200" "$code"
  BID=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" -d '{"amount":99999999}')
  echo "$BID" | grep -qE '"ok":true|"error":' && echo "OK: bid API responds" || { echo "FAIL: bid: $BID"; FAIL=1; }
else
  echo "WARN: no LIVE auction (run npm run db:seed)"
fi

DICT_COUNT=$(sudo docker exec mariadb mariadb -uroot -proot sishi -N -e \
  "SELECT COUNT(*) FROM DictCategory" 2>/dev/null || echo "0")
if [ "${DICT_COUNT:-0}" -gt 0 ]; then
  echo "OK: dict categories seeded ($DICT_COUNT)"
else
  echo "FAIL: dict categories empty (run npm run db:seed)"
  FAIL=1
fi

exit $FAIL
