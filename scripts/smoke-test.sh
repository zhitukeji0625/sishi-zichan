#!/usr/bin/env bash
# HTTP 冒烟测试：需已执行 db:seed 且 dev/start 服务在 BASE 上运行
set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://localhost:3000}"
ADMIN_PHONE="${SMOKE_ADMIN_PHONE:-13900000001}"
ADMIN_PASS="${SMOKE_ADMIN_PASS:-admin123}"
USER_PHONE="${SMOKE_USER_PHONE:-13800138000}"
USER_PASS="${SMOKE_USER_PASS:-user123}"

ADMIN_JAR=$(mktemp)
USER_JAR=$(mktemp)
trap 'rm -f "$ADMIN_JAR" "$USER_JAR"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

echo "=== Public pages ==="
for path in "/" "/m" "/m/login" "/m/register" "/m/auction" "/admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  echo "$path -> $code"
  [ "$code" = "200" ] || fail "$path expected 200"
done

echo "=== Admin auth ==="
resp=$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$ADMIN_PHONE\",\"password\":\"$ADMIN_PASS\"}")
echo "$resp" | grep -q '"ok":true' || fail "admin login"

for path in "/admin" "/admin/assets" "/admin/auctions" "/admin/audit"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN_JAR" "$BASE$path")
  echo "$path -> $code"
  [ "$code" = "200" ] || fail "$path"
done

echo "=== User auth ==="
resp=$(curl -s -c "$USER_JAR" -b "$USER_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$USER_PHONE\",\"password\":\"$USER_PASS\"}")
echo "$resp" | grep -q '"ok":true' || fail "user login"

for path in "/m/me" "/m/orders" "/m/drying"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER_JAR" "$BASE$path")
  echo "$path -> $code"
  [ "$code" = "200" ] || fail "$path"
done

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$USER_PHONE\",\"password\":\"wrong\"}")
[ "$code" = "401" ] || fail "bad password should 401"

echo "=== Auction API (if LIVE project exists) ==="
PROJECT_ID=$(curl -s "$BASE/m/auction" | grep -oE '/m/auction/[a-z0-9]{20,}' | head -1 | sed 's|.*/||' || true)
if [ -n "${PROJECT_ID:-}" ] && [ "$PROJECT_ID" != "page" ]; then
  resp=$(curl -s -b "$USER_JAR" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":99999999}')
  echo "high bid attempt: $resp"
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/m/auction/$PROJECT_ID/bid" \
    -H "Content-Type: application/json" \
    -d '{"amount":1}')
  [ "$code" = "401" ] || fail "unauthenticated bid should 401"
else
  echo "skip auction bid (no project id on listing page)"
fi

echo "=== SSO dev token ==="
TOKEN_RESP=$(curl -s "$BASE/api/dev/third-party-token?u_id=smoke-$(date +%s)" || true)
if echo "$TOKEN_RESP" | grep -q '"token"'; then
  TOKEN=$(echo "$TOKEN_RESP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  SSO=$(curl -s -X POST "$BASE/api/auth/third-party" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\"}")
  echo "$SSO" | grep -q '"ok":true' || fail "third-party login"
else
  echo "skip SSO (dev token endpoint unavailable)"
fi

echo "=== All smoke tests passed ==="
